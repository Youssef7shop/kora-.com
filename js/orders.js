
(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);

  const statusNames = {
    pending: "في انتظار البائع",
    accepted: "مقبول",
    rejected: "مرفوض",
    in_progress: "قيد التنفيذ",
    shipped: "خرج للتوصيل",
    completed: "مكتمل",
    cancelled: "ملغى"
  };

  const transitions = {
    pending: ["accepted", "rejected"],
    accepted: ["in_progress", "cancelled"],
    in_progress: ["shipped", "completed"],
    shipped: ["completed"],
    rejected: [],
    completed: [],
    cancelled: []
  };

  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[c]);

  const money = (value, currency = "MAD") => {
    const n = Number(value);

    if (!Number.isFinite(n)) {
      return "الثمن غير متوفر";
    }

    try {
      return new Intl.NumberFormat("fr-MA", {
        style: "currency",
        currency: currency || "MAD"
      }).format(n);
    } catch {
      return `${n.toFixed(2)} MAD`;
    }
  };

  function showNotice(message, isError = false) {
    const el = $("#orders-notice");

    if (el) {
      el.textContent = message;
      el.style.color = isError ? "#ff7777" : "#50d9a0";
    } else {
      console[isError ? "error" : "log"](message);
    }
  }

  function getClient() {
    if (!window.novaClient) {
      throw new Error(
        "Supabase ما مربوطش. راجع js/supabase-config.js و js/supabase-client.js."
      );
    }

    return window.novaClient;
  }

  function renderOrder(order, items, isSeller) {
    const itemHTML = items.map((item) => `
      <div class="order-item">
        <strong>${esc(item.listing_title || item.title || "منتج")}</strong>
        <span>× ${esc(item.quantity ?? 1)}</span>
        <span>
          ${money(
            item.line_total ??
            (Number(item.unit_price || 0) * Number(item.quantity || 1)),
            order.currency
          )}
        </span>
      </div>
    `).join("");

    const allowed = isSeller
      ? (transitions[order.status] || [])
      : [];

    const buttons = allowed.map((status) => `
      <button
        type="button"
        class="button"
        data-order-id="${esc(order.id)}"
        data-next-status="${esc(status)}">
        ${esc(statusNames[status] || status)}
      </button>
    `).join("");

    const total = order.total ?? order.subtotal ?? order.total_amount;

    const contactButton = `
      <a
        class="button order-contact-button"
        href="messages.html?order=${encodeURIComponent(order.id)}">
        <span aria-hidden="true">💬</span>
        التواصل مع ${isSeller ? "الشاري" : "البائع"}
      </a>
    `;

    return `
      <article class="order-card">
        <div class="order-row">
          <strong>طلب ${esc(order.order_number || order.id)}</strong>
          <strong>${money(total, order.currency)}</strong>
        </div>

        <p>
          الحالة:
          <strong>${esc(statusNames[order.status] || order.status || "غير محددة")}</strong>
        </p>

        <div class="order-items">
          ${itemHTML || "<p>تفاصيل المنتجات غير متوفرة.</p>"}
        </div>

        <p>طريقة الأداء: عند التسليم</p>

        ${order.phone
          ? `<p>الهاتف: ${esc(order.phone)}</p>`
          : ""}

        ${order.delivery_address
          ? `<p>عنوان التوصيل: ${esc(order.delivery_address)}</p>`
          : ""}

        ${order.note
          ? `<p>ملاحظة: ${esc(order.note)}</p>`
          : ""}

        <p class="order-muted">
          ${order.created_at
            ? "تاريخ الطلب: " +
              esc(new Date(order.created_at).toLocaleString("ar-MA"))
            : ""}
        </p>

        <div class="order-actions">
          ${contactButton}
          ${buttons}
        </div>
      </article>
    `;
  }

  async function loadSide(api, userId, field, container, isSeller) {
    if (!container) return;

    const { data: orders, error } = await api
      .from("orders")
      .select("*")
      .eq(field, userId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    if (!orders?.length) {
      container.innerHTML = "<p>ما كاين حتى طلب دابا.</p>";
      return;
    }

    const ids = orders.map((order) => order.id).filter(Boolean);
    let items = [];

    if (ids.length) {
      const result = await api
        .from("order_items")
        .select("*")
        .in("order_id", ids);

      if (result.error) throw result.error;

      items = result.data || [];
    }

    container.innerHTML = orders.map((order) => {
      const orderItems = items.filter(
        (item) => item.order_id === order.id
      );

      return renderOrder(order, orderItems, isSeller);
    }).join("");
  }

  async function loadOrders() {
    const api = getClient();

    showNotice("كنحمّلو الطلبات...");

    const { data, error } = await api.auth.getUser();

    if (error) throw error;

    if (!data?.user) {
      showNotice(
        "خاصك تدخل للحساب ديالك باش تشوف الطلبات.",
        true
      );

      if ($("#orders-list")) {
        $("#orders-list").innerHTML =
          '<a href="login.html">دخول للحساب</a>';
      }

      if ($("#seller-orders-list")) {
        $("#seller-orders-list").innerHTML = "";
      }

      return;
    }

    await Promise.all([
      loadSide(
        api,
        data.user.id,
        "buyer_id",
        $("#orders-list"),
        false
      ),
      loadSide(
        api,
        data.user.id,
        "seller_id",
        $("#seller-orders-list"),
        true
      )
    ]);

    showNotice("تحدّثات لائحة الطلبات.");
  }

  async function updateStatus(button) {
    const api = getClient();
    const id = button.dataset.orderId;
    const next = button.dataset.nextStatus;

    if (!Object.values(transitions).some((list) => list.includes(next))) {
      throw new Error("الحالة المطلوبة غير مسموح بها.");
    }

    const { data: authData, error: authError } =
      await api.auth.getUser();

    if (authError) throw authError;

    if (!authData?.user) {
      throw new Error("دخل للحساب ديالك أولاً.");
    }

    const { data: order, error: orderError } = await api
      .from("orders")
      .select("id,seller_id,status")
      .eq("id", id)
      .maybeSingle();

    if (orderError) throw orderError;

    if (!order || order.seller_id !== authData.user.id) {
      throw new Error("ما عندكش صلاحية لتحديث هاد الطلب.");
    }

    if (!(transitions[order.status] || []).includes(next)) {
      throw new Error("ما يمكنش تبدّل حالة الطلب من هاد المرحلة.");
    }

    button.disabled = true;

    const { error } = await api
      .from("orders")
      .update({
        status: next,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .eq("seller_id", authData.user.id);

    if (error) throw error;

    showNotice("تحدّثات حالة الطلب.");
    await loadOrders();
  }

  document.addEventListener("click", async (event) => {
    const target = event.target;

    if (!(target instanceof Element)) return;

    const button = target.closest(
      "button[data-order-id][data-next-status]"
    );

    if (!button) return;

    try {
      await updateStatus(button);
    } catch (error) {
      console.error("NOVA orders update:", error);

      showNotice(
        error.message || "ما قدرناش نحدّثو حالة الطلب.",
        true
      );

      button.disabled = false;
    }
  });

  async function init() {
    try {
      await loadOrders();
    } catch (error) {
      console.error("NOVA orders loading error:", error);

      showNotice(
        "خطأ فتحميل الطلبات: " +
        (error.message || "خطأ غير معروف"),
        true
      );

      if ($("#orders-list")) {
        $("#orders-list").innerHTML = "";
      }

      if ($("#seller-orders-list")) {
        $("#seller-orders-list").innerHTML = "";
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
