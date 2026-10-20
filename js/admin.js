
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", async function () {
    const client = window.novaClient;
    const notice = document.getElementById("admin-notice");

    const sections = {
      overview: "لوحة المعلومات",
      users: "المستخدمون",
      listings: "الإعلانات",
      orders: "الطلبات",
      logs: "سجل الأنشطة"
    };

    const statusLabels = {
      active: "نشط",
      pending: "في الانتظار",
      paid: "تم الأداء",
      in_progress: "قيد التنفيذ",
      delivered: "تم التسليم",
      completed: "مكتمل",
      cancelled: "ملغى",
      disputed: "نزاع",
      refunded: "مسترجع",
      inactive: "غير نشط"
    };

    let currentUser = null;
    let profiles = [];
    let listings = [];
    let orders = [];
    let logs = [];

    function el(id) {
      return document.getElementById(id);
    }

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

    function showNotice(message, error = false) {
      if (!notice) return;

      notice.hidden = false;
      notice.textContent = message;
      notice.className = error
        ? "admin-notice error-text"
        : "admin-notice";
    }

    function hideNotice() {
      if (!notice) return;
      notice.hidden = true;
      notice.textContent = "";
    }

    function setText(id, value) {
      const node = el(id);
      if (node) node.textContent = String(value ?? "—");
    }

    function formatDate(value) {
      if (!value) return "—";

      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "—";

      return new Intl.DateTimeFormat("ar-MA", {
        dateStyle: "medium"
      }).format(date);
    }

    function money(value, currency = "MAD") {
      try {
        return new Intl.NumberFormat("fr-MA", {
          style: "currency",
          currency: currency || "MAD",
          maximumFractionDigits: 2
        }).format(Number(value || 0));
      } catch {
        return String(value || 0) + " MAD";
      }
    }

    function badge(status) {
      const value = statusLabels[status] || status || "غير محدد";
      let cls = "";

      if (["active", "paid", "completed"].includes(status)) {
        cls = "success";
      } else if (["pending", "in_progress", "delivered"].includes(status)) {
        cls = "warning";
      } else if (["cancelled", "disputed", "refunded"].includes(status)) {
        cls = "danger";
      }

      return `<span class="admin-badge ${cls}">${escapeHTML(value)}</span>`;
    }

    // --------------------------------------------------
    // Navigation
    // --------------------------------------------------

    function openSection(name) {
      if (!sections[name]) return;

      document.querySelectorAll(".admin-section").forEach(function (section) {
        section.classList.toggle("active", section.id === "section-" + name);
      });

      document.querySelectorAll("[data-admin-section]").forEach(function (button) {
        button.classList.toggle(
          "active",
          button.dataset.adminSection === name
        );
      });

      setText("admin-page-title", sections[name]);
    }

    document.querySelectorAll("[data-admin-section]").forEach(function (button) {
      button.addEventListener("click", function () {
        openSection(button.dataset.adminSection);
      });
    });

    // --------------------------------------------------
    // Initial security check
    // --------------------------------------------------

    if (!client) {
      showNotice(
        "Supabase ما متهيّأش. راجع js/supabase-config.js.",
        true
      );
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

      // الدور كيتجاب من قاعدة البيانات، ماشي من المتصفح.
      const { data: profile, error: profileError } = await client
        .from("profiles")
        .select("id, first_name, last_name, role")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profile || !["ADMIN", "SUPER_ADMIN"].includes(profile.role)) {
        document.querySelector(".admin-layout").innerHTML = `
          <main style="
            max-width:600px;
            margin:10vh auto;
            padding:32px;
            text-align:center;
            font-family:system-ui,sans-serif;
          ">
            <h1>⛔ ممنوع الدخول</h1>
            <p>هاد الصفحة مخصصة للإدارة المخولة فقط.</p>
            <a href="index.html">الرجوع للسوق</a>
          </main>
        `;
        return;
      }

      const name = [
        profile.first_name,
        profile.last_name
      ].filter(Boolean).join(" ");

      const profileName = document.querySelector(".admin-profile strong");
      if (profileName) {
        profileName.textContent = name || currentUser.email || "Administrator";
      }

      setText("admin-role-label", profile.role);
      hideNotice();

    } catch (error) {
      console.error("Admin authorization error:", error);

      showNotice(
        "تعذر التحقق من صلاحيات الإدارة. راجع profiles وسياسات RLS.",
        true
      );
      return;
    }

    // --------------------------------------------------
    // Load profiles
    // --------------------------------------------------

    async function loadProfiles() {
      const { data, error } = await client
        .from("profiles")
        .select("id, first_name, last_name, role, created_at")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;

      profiles = data || [];
      renderProfiles();
    }

    function renderProfiles() {
      const target = el("admin-users-table");
      if (!target) return;

      const query = (el("admin-users-search")?.value || "")
        .trim()
        .toLowerCase();

      const filtered = profiles.filter(function (profile) {
        const name = [
          profile.first_name,
          profile.last_name,
          profile.id,
          profile.role
        ].join(" ").toLowerCase();

        return name.includes(query);
      });

      if (!filtered.length) {
        target.innerHTML = `<p class="muted">ما لقينا حتى مستخدم.</p>`;
        return;
      }

      target.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>معرّف الحساب</th>
              <th>الدور</th>
              <th>تاريخ التسجيل</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(function (profile) {
              const name = [
                profile.first_name,
                profile.last_name
              ].filter(Boolean).join(" ") || "بدون اسم";

              return `
                <tr>
                  <td>${escapeHTML(name)}</td>
                  <td>${escapeHTML(profile.id)}</td>
                  <td>${badge(profile.role)}</td>
                  <td>${escapeHTML(formatDate(profile.created_at))}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      `;
    }

    // --------------------------------------------------
    // Load listings
    // --------------------------------------------------

    async function loadListings() {
      const { data, error } = await client
        .from("listings")
        .select("id, title, kind, price, status, seller_id, created_at")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;

      listings = data || [];
      renderListings();
      renderOverviewListings();
    }

    function renderListings() {
      const target = el("admin-listings-table");
      if (!target) return;

      const query = (el("admin-listings-search")?.value || "")
        .trim().toLowerCase();

      const filtered = listings.filter(function (item) {
        return [
          item.title,
          item.id,
          item.kind,
          item.status,
          item.seller_id
        ].join(" ").toLowerCase().includes(query);
      });

      if (!filtered.length) {
        target.innerHTML = `<p class="muted">ما لقينا حتى إعلان.</p>`;
        return;
      }

      target.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>الإعلان</th>
              <th>النوع</th>
              <th>الثمن</th>
              <th>الحالة</th>
              <th>تاريخ النشر</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(function (item) {
              return `
                <tr>
                  <td>${escapeHTML(item.title)}</td>
                  <td>${escapeHTML(item.kind === "service" ? "خدمة" : "منتج")}</td>
                  <td>${escapeHTML(money(item.price))}</td>
                  <td>${badge(item.status)}</td>
                  <td>${escapeHTML(formatDate(item.created_at))}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      `;
    }

    function renderOverviewListings() {
      const target = el("overview-listings");
      if (!target) return;

      const recent = listings.slice(0, 5);

      if (!recent.length) {
        target.innerHTML = `<p class="muted">ما كايناش إعلانات دابا.</p>`;
        return;
      }

      target.innerHTML = `
        <table>
          <thead>
            <tr><th>الإعلان</th><th>الثمن</th><th>الحالة</th></tr>
          </thead>
          <tbody>
            ${recent.map(function (item) {
              return `
                <tr>
                  <td>${escapeHTML(item.title)}</td>
                  <td>${escapeHTML(money(item.price))}</td>
                  <td>${badge(item.status)}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      `;
    }

    // --------------------------------------------------
    // Load orders
    // --------------------------------------------------

    async function loadOrders() {
      const { data, error } = await client
        .from("orders")
        .select("id, order_number, status, total, currency, created_at")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;

      orders = data || [];
      renderOrders();
      renderOverviewOrders();
    }

    function renderOrders() {
      const target = el("admin-orders-table");
      if (!target) return;

      const query = (el("admin-orders-search")?.value || "")
        .trim().toLowerCase();

      const status = el("admin-orders-status")?.value || "all";

      const filtered = orders.filter(function (order) {
        const matchesSearch = [
          order.id,
          order.order_number,
          order.status
        ].join(" ").toLowerCase().includes(query);

        const matchesStatus = status === "all" || order.status === status;

        return matchesSearch && matchesStatus;
      });

      if (!filtered.length) {
        target.innerHTML = `<p class="muted">ما لقينا حتى طلب.</p>`;
        return;
      }

      target.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>رقم الطلب</th>
              <th>المجموع</th>
              <th>الحالة</th>
              <th>التاريخ</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(function (order) {
              return `
                <tr>
                  <td>${escapeHTML(order.order_number || order.id.slice(0, 8))}</td>
                  <td>${escapeHTML(money(order.total, order.currency))}</td>
                  <td>${badge(order.status)}</td>
                  <td>${escapeHTML(formatDate(order.created_at))}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      `;
    }

    function renderOverviewOrders() {
      const target = el("overview-orders");
      if (!target) return;

      const recent = orders.slice(0, 5);

      if (!recent.length) {
        target.innerHTML = `<p class="muted">ما كايناش طلبات دابا.</p>`;
        return;
      }

      target.innerHTML = recent.map(function (order) {
        return `
          <div class="admin-recent-item">
            <div>
              <strong>
                ${escapeHTML(order.order_number || order.id.slice(0, 8))}
              </strong>
              <small>${escapeHTML(formatDate(order.created_at))}</small>
            </div>
            <div>
              <strong>${escapeHTML(money(order.total, order.currency))}</strong>
              ${badge(order.status)}
            </div>
          </div>
        `;
      }).join("");
    }

    // --------------------------------------------------
    // Load audit logs
    // --------------------------------------------------

    async function loadLogs() {
      const target = el("admin-logs-table");
      if (!target) return;

      const { data, error } = await client
        .from("admin_audit_logs")
        .select("id, admin_id, action, target_type, target_id, details, created_at")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;

      logs = data || [];

      if (!logs.length) {
        target.innerHTML = `<p class="muted">ما تسجلات حتى عملية إدارية.</p>`;
        return;
      }

      target.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>العملية</th>
              <th>النوع</th>
              <th>المعرّف</th>
              <th>المدير</th>
              <th>التاريخ</th>
            </tr>
          </thead>
          <tbody>
            ${logs.map(function (log) {
              return `
                <tr>
                  <td>${escapeHTML(log.action)}</td>
                  <td>${escapeHTML(log.target_type || "—")}</td>
                  <td>${escapeHTML(log.target_id || "—")}</td>
                  <td>${escapeHTML(log.admin_id || "—")}</td>
                  <td>${escapeHTML(formatDate(log.created_at))}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      `;
    }

    // --------------------------------------------------
    // Search handlers
    // --------------------------------------------------

    el("admin-users-search")?.addEventListener("input", renderProfiles);
    el("admin-listings-search")?.addEventListener("input", renderListings);
    el("admin-orders-search")?.addEventListener("input", renderOrders);
    el("admin-orders-status")?.addEventListener("change", renderOrders);

    // --------------------------------------------------
    // Refresh
    // --------------------------------------------------

    async function refreshAll() {
      const button = el("admin-refresh");

      if (button) {
        button.disabled = true;
        button.textContent = "كنحدّثو...";
      }

      hideNotice();

      try {
        await Promise.all([
          loadProfiles(),
          loadListings(),
          loadOrders(),
          loadLogs()
        ]);

        setText("stat-users", profiles.length);
        setText(
          "stat-listings",
          listings.filter(item => item.status === "active").length
        );
        setText("stat-orders", orders.length);
        setText(
          "stat-completed",
          orders.filter(item => item.status === "completed").length
        );

        showNotice("تحدّثات البيانات بنجاح.");
      } catch (error) {
        console.error("Admin refresh error:", error);
        showNotice(
          "وقع مشكل فتحميل البيانات. تأكد من الجداول وسياسات RLS.",
          true
        );
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = "↻ تحديث البيانات";
        }
      }
    }

    el("admin-refresh")?.addEventListener("click", refreshAll);

    await refreshAll();
  });
})();
