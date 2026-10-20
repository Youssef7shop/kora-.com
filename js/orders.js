
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", async function () {
    const client = window.novaClient;

    const list = document.getElementById("orders-list");
    const notice = document.getElementById("orders-notice");
    const searchInput = document.getElementById("orders-search");
    const roleFilter = document.getElementById("orders-role-filter");
    const statusFilter = document.getElementById("orders-status-filter");

    if (!list) return;

    let currentUser = null;
    let orders = [];
    let quickStatus = "all";

    const STATUS_LABELS = {
      pending: "في الانتظار",
      paid: "تم الأداء",
      in_progress: "قيد التنفيذ",
      delivered: "تم التسليم",
      completed: "مكتمل",
      cancelled: "ملغى",
      disputed: "نزاع",
      refunded: "مسترجع"
    };

    const ACTIVE_STATUSES = ["pending", "paid", "in_progress", "delivered"];

    // ==================================================
    // أدوات مساعدة
    // ==================================================

    function escapeHTML(value) {
      return String(value ?? "").replace(/[&<>"']/g, function (char) {
        return {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        }[char];
      });
    }

    function showNotice(message, isError = false) {
      if (!notice) {
        if (window.NOVA?.toast) window.NOVA.toast(message);
        else console.log(message);
        return;
      }

      notice.hidden = false;
      notice.textContent = message;
      notice.className = "orders-notice " + (
        isError ? "error-text" : "success-text"
      );
    }

    function clearNotice() {
      if (!notice) return;
      notice.hidden = true;
      notice.textContent = "";
    }

    function money(amount, currency = "MAD") {
      const value = Number(amount || 0);

      try {
        return new Intl.NumberFormat("fr-MA", {
          style: "currency",
          currency,
          maximumFractionDigits: 2
        }).format(value);
      } catch {
        return value.toFixed(2) + " " + currency;
      }
    }

    function formatDate(value) {
      if (!value) return "—";

      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "—";

      return new Intl.DateTimeFormat("ar-MA", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(date);
    }

    function orderNumber(order) {
      return order.order_number
        ? "#" + order.order_number
        : "#" + String(order.id || "").slice(0, 8).toUpperCase();
    }

    function orderTitle(order) {
      const items = Array.isArray(order.order_items)
        ? order.order_items
        : [];

      if (items.length === 0) return "طلب NOVA MARKET";

      if (items.length === 1) {
        return items[0].listing_title || "منتج أو خدمة";
      }

      return (items[0].listing_title || "منتج أو خدمة") +
        " +" + (items.length - 1) + " آخر";
    }

    function isBuyer(order) {
      return order.buyer_id === currentUser.id;
    }

    function isSeller(order) {
      return order.seller_id === currentUser.id;
    }

    // ==================================================
    // التحقق من Supabase والحساب
    // ==================================================

    if (!client) {
      list.innerHTML = `
        <div class="order-empty">
          Supabase ما متهيّأش. راجع js/supabase-config.js.
        </div>
      `;
      return;
    }

    try {
      const { data, error } = await client.auth.getUser();

      if (error) throw error;

      currentUser = data.user;

      if (!currentUser) {
        window.location.replace("login.html");
        return;
      }
    } catch (error) {
      console.error("Orders auth error:", error);

      list.innerHTML = `
        <div class="order-empty">
          ما قدرناش نتحققو من الحساب ديالك.
        </div>
      `;
      return;
    }

    // ==================================================
    // تحميل الطلبات
    // ==================================================

    async function loadOrders() {
      list.innerHTML = `
        <div class="order-empty">كنحمّلو الطلبات...</div>
      `;

      try {
        const { data, error } = await client
          .from("orders")
          .select(`
            id,
            order_number,
            buyer_id,
            seller_id,
            status,
            currency,
            subtotal,
            total,
            payment_status,
            payment_method,
            buyer_note,
            seller_note,
            created_at,
            updated_at,
            order_items (
              id,
              listing_title,
              listing_kind,
              unit_price,
              quantity,
              line_total
            )
          `)
          .order("created_at", { ascending: false });

        if (error) throw error;

        // RLS خاصها أصلاً ترجع غير الطلبات المسموح بها
        orders = (data || []).filter(function (order) {
          return isBuyer(order) || isSeller(order);
        });

        updateStats();
        renderOrders();
      } catch (error) {
        console.error("Load orders error:", error);

        list.innerHTML = `
          <div class="order-empty">
            <h3>ما قدرناش نحمّلو الطلبات</h3>
            <p>تأكد من SQL ديال orders ومن صلاحيات RLS.</p>
          </div>
        `;

        showNotice(
          error.message || "وقع مشكل فتحميل الطلبات.",
          true
        );
      }
    }

    // ==================================================
    // الإحصائيات
    // ==================================================

    function updateStats() {
      const total = orders.length;

      const active = orders.filter(function (order) {
        return ACTIVE_STATUSES.includes(order.status);
      }).length;

      const completed = orders.filter(function (order) {
        return order.status === "completed";
      }).length;

      const selling = orders.filter(isSeller).length;

      setText("stat-total", total);
      setText("stat-active", active);
      setText("stat-completed", completed);
      setText("stat-selling", selling);
    }

    function setText(id, value) {
      const element = document.getElementById(id);
      if (element) element.textContent = String(value);
    }

    // ==================================================
    // البحث والفلترة
    // ==================================================

    function getFilteredOrders() {
      const search = (searchInput?.value || "").trim().toLowerCase();
      const role = roleFilter?.value || "all";
      const status = statusFilter?.value || "all";

      return orders.filter(function (order) {
        if (role === "buying" && !isBuyer(order)) return false;
        if (role === "selling" && !isSeller(order)) return false;

        if (status !== "all" && order.status !== status) return false;

        if (quickStatus !== "all" && order.status !== quickStatus) {
          return false;
        }

        if (search) {
          const text = [
            orderNumber(order),
            order.id,
            orderTitle(order),
            order.status,
            STATUS_LABELS[order.status] || "",
            ...(order.order_items || []).map(item => item.listing_title || "")
          ].join(" ").toLowerCase();

          if (!text.includes(search)) return false;
        }

        return true;
      });
    }

    function renderOrders() {
      const filtered = getFilteredOrders();

      if (!filtered.length) {
        list.innerHTML = `
          <div class="order-empty">
            <h3>ما لقينا حتى طلب</h3>
            <p>بدّل الفلترة أو رجع للسوق باش تكتشف المنتجات والخدمات.</p>
            <a href="index.html" class="button">اكتشف السوق</a>
          </div>
        `;
        return;
      }

      list.innerHTML = filtered.map(function (order) {
        const buyer = isBuyer(order);
        const title = orderTitle(order);
        const statusLabel = STATUS_LABELS[order.status] || order.status;
        const paymentLabel = order.payment_status === "paid"
          ? "الأداء مؤكد"
          : order.payment_status === "refunded"
            ? "مسترجع"
            : order.payment_status === "pending"
              ? "الأداء قيد التحقق"
              : order.payment_status === "failed"
                ? "فشل الأداء"
                : "غير مؤدى";

        const itemSummary = (order.order_items || []).map(function (item) {
          return `
            <div>
              ${escapeHTML(item.listing_title)}
              — ${escapeHTML(item.quantity)} ×
              ${escapeHTML(money(item.unit_price, order.currency))}
            </div>
          `;
        }).join("");

        return `
          <article class="order-card">
            <div class="order-card-header">
              <span class="order-status">
                ${escapeHTML(statusLabel)}
              </span>
              <span class="muted">${escapeHTML(orderNumber(order))}</span>
            </div>

            <h3>${escapeHTML(title)}</h3>

            <p>
              ${buyer ? "المشتريات ديالي" : "طلب توصل به المتجر ديالي"}
              · ${escapeHTML(formatDate(order.created_at))}
            </p>

            <div class="order-items-summary">
              ${itemSummary}
            </div>

            <p>
              حالة الأداء:
              <strong>${escapeHTML(paymentLabel)}</strong>
            </p>

            <div class="order-card-footer">
              <span class="order-price">
                ${escapeHTML(money(order.total, order.currency))}
              </span>

              <span class="muted">
                ${buyer ? "الزبون" : "البائع"}
              </span>
            </div>

            <div class="order-actions">
              <button
                type="button"
                class="primary-action"
                data-order-details="${escapeHTML(order.id)}"
              >
                تفاصيل الطلب
              </button>

              <a href="messages.html">
                المحادثات
              </a>
            </div>
          </article>
        `;
      }).join("");
    }

    // ==================================================
    // أحداث البحث والفلترة
    // ==================================================

    searchInput?.addEventListener("input", renderOrders);
    roleFilter?.addEventListener("change", renderOrders);

    statusFilter?.addEventListener("change", function () {
      quickStatus = "all";

      document.querySelectorAll("[data-order-tab]").forEach(function (button) {
        button.classList.toggle(
          "active",
          button.dataset.orderTab === "all"
        );
      });

      renderOrders();
    });

    document.querySelectorAll("[data-order-tab]").forEach(function (button) {
      button.addEventListener("click", function () {
        quickStatus = button.dataset.orderTab || "all";

        document.querySelectorAll("[data-order-tab]").forEach(function (item) {
          item.classList.toggle("active", item === button);
        });

        if (statusFilter) statusFilter.value = "all";

        renderOrders();
      });
    });

    // ==================================================
    // تفاصيل الطلب
    // ==================================================

    list.addEventListener("click", function (event) {
      const button = event.target.closest("[data-order-details]");
      if (!button) return;

      const order = orders.find(function (item) {
        return item.id === button.dataset.orderDetails;
      });

      if (!order) {
        showNotice("ما لقيناش تفاصيل هاد الطلب.", true);
        return;
      }

      const details = [
        "رقم الطلب: " + orderNumber(order),
        "المنتج/الخدمة: " + orderTitle(order),
        "الحالة: " + (STATUS_LABELS[order.status] || order.status),
        "الثمن: " + money(order.total, order.currency),
        "حالة الأداء: " + order.payment_status,
        "تاريخ الإنشاء: " + formatDate(order.created_at)
      ];

      const items = (order.order_items || []).map(function (item) {
        return (
          "- " + item.listing_title +
          " | الكمية: " + item.quantity +
          " | الثمن: " + money(item.line_total, order.currency)
        );
      });

      alert(details.concat(items).join("\n"));
    });

    // ==================================================
    // بدء الصفحة
    // ==================================================

    await loadOrders();
  });
})();
