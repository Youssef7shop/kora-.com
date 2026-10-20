
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    const grid = document.getElementById("listing-grid");

    // إلا ما كانتش صفحة السوق، ما نديرو والو
    if (!grid) return;

    const searchInput = document.getElementById("search");
    const kindFilter = document.getElementById("kind-filter");
    const categoryFilter = document.getElementById("category-filter");

    let listings = [];

    const categories = {
      product: "منتج",
      service: "خدمة رقمية"
    };

    function escapeHTML(value) {
      if (window.NOVA) return window.NOVA.esc(value);

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

    function formatPrice(price) {
      if (price === null || price === undefined || price === "") {
        return "الثمن عند التواصل";
      }

      const amount = Number(price);

      if (!Number.isFinite(amount)) return "الثمن عند التواصل";

      return new Intl.NumberFormat("fr-MA", {
        style: "currency",
        currency: "MAD",
        maximumFractionDigits: 2
      }).format(amount);
    }

    function showNotice(text) {
      if (window.NOVA?.toast) {
        window.NOVA.toast(text);
      } else {
        alert(text);
      }
    }

    function renderListings() {
      const search = (searchInput?.value || "").trim().toLowerCase();
      const kind = kindFilter?.value || "all";
      const category = categoryFilter?.value || "";

      const filtered = listings.filter(function (item) {
        const searchableText = [
          item.title,
          item.description,
          item.category,
          item.city
        ].join(" ").toLowerCase();

        const matchesSearch = searchableText.includes(search);
        const matchesKind = kind === "all" || item.kind === kind;
        const matchesCategory = !category || item.category === category;

        return matchesSearch && matchesKind && matchesCategory;
      });

      if (!filtered.length) {
        grid.innerHTML = `
          <div class="empty-state">
            <h3>ما لقينا حتى إعلان</h3>
            <p>جرّب كلمات أخرى أو بدّل التصنيف.</p>
          </div>
        `;
        return;
      }

      grid.innerHTML = filtered.map(function (item) {
        const image = item.image_url
          ? `<img src="${escapeHTML(item.image_url)}"
                  alt="${escapeHTML(item.title)}"
                  loading="lazy"
                  referrerpolicy="no-referrer"
                  onerror="this.parentElement.innerHTML='<span class=&quot;listing-placeholder&quot;>N</span>'">`
          : `<span class="listing-placeholder">✦</span>`;

        return `
          <article class="listing-card">
            <div class="listing-image">${image}</div>

            <div class="listing-content">
              <span class="pill">
                ${escapeHTML(categories[item.kind] || "إعلان")}
              </span>

              <h3>${escapeHTML(item.title)}</h3>

              <p>${escapeHTML(item.description || "ما كاينش وصف لهاد الإعلان.")}</p>

              <div class="listing-meta">
                <span class="price">${formatPrice(item.price)}</span>
                <span class="pill">${escapeHTML(item.category || "أخرى")}</span>
              </div>

              <p class="muted">
                ${item.city ? "📍 " + escapeHTML(item.city) : ""}
              </p>

              <button
                class="button button-primary"
                type="button"
                data-contact="${escapeHTML(item.id)}"
              >
                تواصل مع البائع
              </button>
            </div>
          </article>
        `;
      }).join("");
    }

    async function loadListings() {
      if (!window.novaClient) {
        grid.innerHTML = `
          <div class="empty-state">
            <h3>قاعدة البيانات مازال ما مربوطةش</h3>
            <p>راجع إعدادات Supabase فـ js/supabase-config.js.</p>
          </div>
        `;
        return;
      }

      grid.innerHTML = `<p class="muted">كنحمّلو الإعلانات...</p>`;

      try {
        const { data, error } = await window.novaClient
          .from("listings")
          .select("id, seller_id, kind, title, description, price, category, image_url, city")
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(100);

        if (error) throw error;

        listings = data || [];
        renderListings();
      } catch (error) {
        console.error("NOVA MARKET listings:", error);

        grid.innerHTML = `
          <div class="empty-state">
            <h3>ما قدرناش نحمّلو الإعلانات</h3>
            <p>تأكد من إعدادات Supabase ومن تشغيل SQL الخاص بالمشروع.</p>
            <button class="button" type="button" id="retry-listings">
              عاود المحاولة
            </button>
          </div>
        `;

        document.getElementById("retry-listings")?.addEventListener(
          "click",
          loadListings
        );
      }
    }

    // البحث والتصفية
    searchInput?.addEventListener("input", renderListings);
    kindFilter?.addEventListener("change", renderListings);
    categoryFilter?.addEventListener("change", renderListings);

    // التواصل مع البائع
    grid.addEventListener("click", async function (event) {
      const button = event.target.closest("[data-contact]");

      if (!button) return;

      const listingId = button.dataset.contact;

      try {
        const { data: authData, error: authError } =
          await window.novaClient.auth.getUser();

        if (authError) throw authError;

        if (!authData.user) {
          window.location.href = "login.html";
          return;
        }

        const listing = listings.find(function (item) {
          return item.id === listingId;
        });

        if (!listing) {
          showNotice("هاد الإعلان ما بقاش متوفر.");
          return;
        }

        if (listing.seller_id === authData.user.id) {
          showNotice("ما تقدرش تبدا محادثة مع راسك.");
          return;
        }

        button.disabled = true;
        button.textContent = "كنفتحو المحادثة...";

        const { data, error } = await window.novaClient.rpc(
          "start_conversation",
          { p_listing_id: listingId }
        );

        if (error) throw error;

        const conversationId = Array.isArray(data) ? data[0] : data;

        if (!conversationId) {
          throw new Error("ما قدرناش نلقاو المحادثة.");
        }

        window.location.href =
          "messages.html?conversation=" +
          encodeURIComponent(conversationId);
      } catch (error) {
        console.error("NOVA MARKET conversation:", error);
        showNotice(error.message || "وقع مشكل ففتح المحادثة.");
        button.disabled = false;
        button.textContent = "تواصل مع البائع";
      }
    });

    loadListings();
  });
})();
