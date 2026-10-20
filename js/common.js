
(function () {
  "use strict";

  const NOVA = {};

  NOVA.client = function () {
    if (!window.novaClient) {
      throw new Error(
        "Supabase مازال ما متهيّأش. راجع js/supabase-config.js"
      );
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
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      };

      return entities[char];
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

    if (NOVA.toastTimer) {
      clearTimeout(NOVA.toastTimer);
    }

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

  document.addEventListener("DOMContentLoaded", function () {
    NOVA.initTheme();

    document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
      button.addEventListener("click", NOVA.toggleTheme);
    });

    document.querySelectorAll("[data-signout]").forEach(function (button) {
      button.addEventListener("click", NOVA.signOut);
    });

    if (window.novaClient) {
      window.novaClient.auth.getUser()
        .then(function ({ data }) {
          const user = data.user;

          document.querySelectorAll("[data-nav-user]").forEach(function (link) {
            if (user) {
              link.textContent = "حسابي";
              link.href = "dashboard.html";
            } else {
              link.textContent = "دخول";
              link.href = "login.html";
            }
          });
        })
        .catch(function (error) {
          console.error("NOVA MARKET auth check:", error);
        });
    }
  });

  window.NOVA = NOVA;
})();
