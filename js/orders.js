() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);

  // الحالات المتوافقة مع قاعدة بيانات NOVA MARKET
  const statusNames = {
    pending: "في انتظار البائع",
    paid: "تم تأكيد الأداء",
    in_progress: "قيد التنفيذ",
    delivered: "تم التسليم",
    completed: "مكتمل",
    cancelled: "ملغى",
    disputed: "في نزاع",
    refunded: "تم إرجاع المبلغ"
  };

  // الحالات المسموح للبايع يبدّل ليها الطلب
  const transitions = {
    pending: ["in_progress", "cancelled"],
    paid: ["in_progress", "cancelled"],
    in_progress: ["delivered", "cancelled"],
    delivered: ["completed"],
    completed: [],
    cancelled: [],
    disputed: [],
    refunded: []
  };

  const $all = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));

  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  function money(value, currency = "MAD") {
    const amount = Number(value);

    if (!Number.isFinite(amount)) return "الثمن غير متوفر";

    try {
      return new Intl.NumberFormat("fr-MA", {
        style: "currency",
        currency: currency || "MAD"
      }).format(amount);
    } catch {
      return `${amount.toFixed(2)} MAD`;
    }
  }

  function showNotice(message, isError = false) {
    const element = $("#orders-notice");

    if (element) {
      element.textContent = message;
      element.style.color = isError ? "#ff7777" : "#50d9a0";
    }

    console[isError ? "error" : "log"](message);
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
    const itemHTML = items.map((item) => {
      const quantity = Number(item.quantity || 1);
      const lineTotal = item.line_total ??
        (Number(item.unit_price || 0) * quantity);

      return `
        <div class="order-item">
          <strong>${esc(item.listing_title || item.title || "منتج")}</strong>
          <span>× ${esc(quantity)}</span>
          <span>${money(lineTotal, order.currency)}</span>
        </div>
      `;
    }).join("");

    const allowedStatuses = isSeller
      ? (transitions[order.status] || [])
      : [];

    const statusButtons = allowedStatuses.map((status) => `
      <button
        type="button"
        class="button"
        data-order-id="${esc(order.id)}"
        data-next-status="${esc(status)}">
        ${esc(statusNames[status] || status)}
      </button>
    `).join("");

    const total = order.total ?? order.subtotal ?? order.amount ?? 0;