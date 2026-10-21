
(function () {
  "use strict";

  const NOVA = {};

  NOVA.client = function () {
    if (!window.novaClient) {
      throw new Error("Supabase مازال ما متهيّأش. راجع js/supabase-config.js");
    }
    return window.novaClient;
  };

  NOVA.user = async function () {
    const { data, error } = await NOVA.client().auth.getUser();
    if (error) throw error;
    return data.user || null;
  };

  NOVA.requireUser = async function () {
    const user = await NOVA.user();
    if (!user) {
      window.location.href = "login.html";
      return null;
    }
    return user;
  };

  NOVA.esc = function (value) {
    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char];
    });
  };

  NOVA.money = function (amount, currency = "MAD") {
    const number = Number(amount);
    if (!Number.isFinite(number)) return "الثمن غير محدد";

    return new Intl.NumberFormat("fr-MA", {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    }).format(number);
  };

  NOVA.toast = function (message) {
    let notice = document.getElementById("notice");

    if (!notice) {
      notice = document.createElement("div");
      notice.id = "notice";
      notice.className = "notice";
      notice.setAttribute("role", "status");
      document.body.appendChild(notice);
    }

    notice.textContent = String(message);
    notice.classList.add("show");

    clearTimeout(NOVA.toastTimer);
    NOVA.toastTimer = setTimeout(function () {
      notice.classList.remove("show");
    }, 3500);
  };

  NOVA.profile = async function (userId) {
    const { data, error } = await NOVA.client()
      .from("profiles")
      .select("id, display_name, avatar_url, city")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  };

  // جلب الاسم والصورة من Supabase وGoogle إذا توفرت
  NOVA.getAccountInfo = async function (user) {
    const metadata = user.user_metadata || {};
    let profile = null;

    try {
      profile = await NOVA.profile(user.id);
    } catch (error) {
      console.warn("تعذر تحميل profile:", error.message);
    }

    const name =
      profile?.display_name ||
      metadata.full_name ||
      metadata.name ||
      [metadata.first_name, metadata.last_name].filter(Boolean).join(" ") ||
      (user.email ? user.email.split("@")[0] : "المستخدم");

    const avatar =
      profile?.avatar_url ||
      metadata.avatar_url ||
      metadata.picture ||
      "images/default-avatar.png";

    return {
      id: user.id,
      name: name,
      email: user.email || "",
      avatar: avatar,
      city: profile?.city || ""
    };
  };

  // عرض بيانات الحساب في عناصر القائمة أو الصفحة
  NOVA.renderAccount = async function (user) {
    if (!user) return;

    const account = await NOVA.getAccountInfo(user);

    document.querySelectorAll("[data-account-name]").forEach(function (el) {
      el.textContent = account.name;
    });

    document.querySelectorAll("[data-account-email]").forEach(function (el) {
      el.textContent = account.email;
    });

    document.querySelectorAll("[data-account-avatar]").forEach(function (el) {
      el.src = account.avatar;
      el.alt = "صورة " + account.name;

      el.onerror = function () {
        this.onerror = null;
        this.src = "images/default-avatar.png";
      };
    });

    return account;
  };

  NOVA.signOut = async function () {
    const { error } = await NOVA.client().auth.signOut();

    if (error) {
      NOVA.toast("ما قدرناش نسجلو الخروج: " + error.message);
      return;
    }

    window.location.href = "index.html";
  };

  NOVA.initTheme = function () {
    const savedTheme = localStorage.getItem("nova-theme");
    const theme = savedTheme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", theme);
  };

  NOVA.toggleTheme = function () {
    const root = document.documentElement;
    const current = root.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";

    root.setAttribute("data-theme", next);
    localStorage.setItem("nova-theme", next);
  };

  document.addEventListener("DOMContentLoaded", async function () {
    NOVA.initTheme();

    document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
      button.addEventListener("click", NOVA.toggleTheme);
    });

    document.querySelectorAll("[data-signout], #logout-button").forEach(function (button) {
      button.addEventListener("click", NOVA.signOut);
    });

    if (!window.novaClient) return;

    try {
      const user = await NOVA.user();

      document.querySelectorAll("[data-nav-user]").forEach(function (link) {
        link.textContent = user ? "حسابي" : "دخول";
        link.href = user ? "dashboard.html" : "login.html";
      });

      if (user) {
        await NOVA.renderAccount(user);
      }
    } catch (error) {
      console.error("NOVA MARKET account:", error);
    }
  });

  window.NOVA = NOVA;
})();
