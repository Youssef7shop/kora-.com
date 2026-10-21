
(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);

  const escapeHTML = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  const money = (value) =>
    `${Number(value || 0).toFixed(2)} درهم`;

  const statusNames = {
    pending: "في انتظار موافقة البائع",
    accepted: "مقبول",
    rejected: "مرفوض",
    in_progress: "قيد التنفيذ",
    shipped: "خرج للتوصيل",
    completed: "مكتمل",
    cancelled: "ملغى"
  };

  const sellerTransitions = {
    pending: ["accepted", "rejected"],
    accepted: ["in_progress", "cancelled"],
    in_progress: ["shipped", "completed"],
    shipped: ["completed"],
    rejected: [],
    completed: [],
    cancelled: []
  };

  function notice(message, error = false) {
    const el = $("#orders-notice");
    if (!el) return;
    el.textContent = message;
    el.style.color = error ? "#ff7777" : "#54d6a0";
  }

  function client() {
    if (!window.novaClient) {
      throw new Error("Supabase مازال ما متهيّأش. راجع js/supabase-config.js");
    }
    return window.novaClient;
  }

  function renderOrder(order, isSeller) {
    const items = (order.order_items || []).map((item) => `
      <div>
        ${escapeHTML(item.title)} × ${Number(item.quantity)}
        — ${money(item.line_total)}
      </div>
    `).join("");

    const allowed = isSeller
      ? (sellerTransitions[order.status] || [])
      : [];

    const actions = allowed.map((status) => `
      <button type="button"
        data-order-id="${escapeHTML(order.id)}"
        data-next-status="${escapeHTML(status)}">
        ${escapeHTML(statusNames[status] || status)}
      </button>
    `).join("");

    return `
      <article class="order-card">
        <div class="order-row">
          <strong>${escapeHTML(order.order_number || order.id)}</strong>
          <strong>${money(order.total)}</strong>
        </div>
        <p>الحالة: <strong>${escapeHTML(statusNames[order.status] || order.status)}</strong></p>
        <div>${items || "تفاصيل المنتج غير متوفرة"}</div>
        <p class="order-muted">الأداء: عند التسليم</p>
        <p>الهاتف: ${escapeHTML(order.phone)}</p>
        <p>العنوان: ${escapeHTML(order.delivery_address)}</p>
        ${order.note ? `<p>ملاحظة: ${escapeHTML(order.note)}</p>` : ""}
        <p class="order-muted">
          تاريخ الطلب: ${escapeHTML(new Date(order.created_at).toLocaleString("ar-MA"))}
        </p>
        ${actions ? `<div class="order-actions">${actions}</div>` : ""}
      </article>
    `;
  }

  async function loadOrders() {
    const api = client();
    const { data: authData, error: authError } = await api.auth.getUser();

    if (authError) throw authError;
    const user = authData?.user;

    if (!user) {
      notice("خاصك تدخل للحساب ديالك باش تشوف الطلبات.", true);
      if ($("#orders-list")) {
        $("#orders-list").innerHTML =
          '<a href="login.html">دخول للحساب</a>';
      }
      if ($("#seller-orders-list")) {
        $("#seller-orders-list").innerHTML = "";
      }
      return;
    }

    const [buyerResult, sellerResult] = await Promise.all([
      api.from("orders")
        .select("id,order_number,buyer_id,seller_id,status,total,currency,payment_method,delivery_address,phone,note,created_at,order_items(title,quantity,unit_price,line_total)")
        .eq("buyer_id", user.id)
        .order("created_at", { ascending: false }),

      api.from("orders")
        .select("id,order_number,buyer_id,seller_id,status,total,currency,payment_method,delivery_address,phone,note,created_at,order_items(title,quantity,unit_price,line_total)")
        .eq("seller_id", user.id)
        .order("created_at", { ascending: false })
    ]);

    if (buyerResult.error) throw buyerResult.error;
    if (sellerResult.error) throw sellerResult.error;

    $("#orders-list").innerHTML = buyerResult.data.length
      ? buyerResult.data.map((order) => renderOrder(order, false)).join("")
      : "<p>ما عندك حتى طلب دابا.</p>";

    $("#seller-orders-list").innerHTML = sellerResult.data.length
      ? sellerResult.data.map((order) => renderOrder(order, true)).join("")
      : "<p>ما توصلتي حتى بطلب دابا.</p>";
  }

  async function updateStatus(orderId, nextStatus, button) {
    const api = client();

    if (!Object.values(sellerTransitions).some((list) =>
      list.includes(nextStatus)
    )) {
      throw new Error("الحالة المطلوبة غير مسموح بها.");
    }

    button.disabled = true;
    const { error } = await api
      .from("orders")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString()
      })
      .eq("id", orderId);

    if (error) throw error;
    notice("تحدّثات حالة الطلب بنجاح.");
    await loadOrders();
  }

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-order-id][data-next-status]");
    if (!button) return;

    try {
      await updateStatus(
        button.dataset.orderId,
        button.dataset.nextStatus,
        button
      );
    } catch (error) {
      notice(error.message || "ما قدرناش نحدّثو الطلب.", true);
      button.disabled = false;
    }
  });

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      await loadOrders();
    } catch (error) {
      console.error("NOVA orders:", error);
      notice(error.message || "وقع خطأ أثناء تحميل الطلبات.", true);
      if ($("#orders-list")) $("#orders-list").innerHTML = "";
      if ($("#seller-orders-list")) $("#seller-orders-list").innerHTML = "";
    }
  });
})();
