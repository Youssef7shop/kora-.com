
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    const grid = document.getElementById("listing-grid");
    if (!grid) return;

    const searchInput = document.getElementById("search");
    const kindFilter = document.getElementById("kind-filter");
    const categoryFilter = document.getElementById("category-filter");

    let listings = [];

    const categories = {
      product: "منتج",
      service: "خدمة رقمية"
    };

    function esc(value) {
      if (window.NOVA) return window.NOVA.esc(value);
      return String(value ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;",
        '"': "&quot;", "'": "&#39;"
      })[c]);
    }

    function price(value) {
      const amount = Number(value);
      if (value == null || value === "" || !Number.isFinite(amount)) {
        return "الثمن عند التواصل";
      }
      return new Intl.NumberFormat("fr-MA", {
        style: "currency",
        currency: "MAD"
      }).format(amount);
    }

    function notice(message) {
      if (window.NOVA?.toast) window.NOVA.toast(message);
      else alert(message);
    }

    function renderListings() {
      const search = (searchInput?.value || "").trim().toLowerCase();
      const kind = kindFilter?.value || "all";
      const category = categoryFilter?.value || "";

      const filtered = listings.filter(item => {
        const text = [
          item.title, item.description, item.category, item.city
        ].join(" ").toLowerCase();

        return text.includes(search) &&
          (kind === "all" || item.kind === kind) &&
          (!category || item.category === category);
      });

      if (!filtered.length) {
        grid.innerHTML = `
          <div class="empty-state">
            <h3>ما لقينا حتى إعلان</h3>
            <p>جرّب كلمات أخرى أو بدّل التصنيف.</p>
          </div>`;
        return;
      }

      grid.innerHTML = filtered.map(item => {
        const image = item.image_url
          ? `<img src="${esc(item.image_url)}"
                  alt="${esc(item.title)}"
                  loading="lazy"
                  referrerpolicy="no-referrer">`
          : `<span class="listing-placeholder">✦</span>`;

        return `
          <article class="listing-card">
            <div class="listing-image">${image}</div>
            <div class="listing-content">
              <span class="pill">${esc(categories[item.kind] || "إعلان")}</span>
              <h3>${esc(item.title)}</h3>
              <p>${esc(item.description || "ما كاينش وصف لهاد الإعلان.")}</p>

              <div class="listing-meta">
                <span class="price">${price(item.price)}</span>
                <span class="pill">${esc(item.category || "أخرى")}</span>
              </div>

              <p class="muted">${item.city ? "📍 " + esc(item.city) : ""}</p>

              <div class="market-actions">
                <button class="button button-primary"
                  type="button" data-order="${esc(item.id)}">
                  طلب الآن
                </button>

                <button class="button"
                  type="button" data-contact="${esc(item.id)}">
                  تواصل مع البائع
                </button>
              </div>
            </div>
          </article>`;
      }).join("");
    }

    async function loadListings() {
      if (!window.novaClient) {
        grid.innerHTML = `
          <div class="empty-state">
            <h3>قاعدة البيانات مازال ما مربوطةش</h3>
            <p>راجع js/supabase-config.js.</p>
          </div>`;
        return;
      }

      grid.innerHTML = '<p class="muted">كنحمّلو الإعلانات...</p>';

      try {
        const { data, error } = await window.novaClient
          .from("listings")
          .select("id,seller_id,kind,title,description,price,category,image_url,city,status")
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(100);

        if (error) throw error;
        listings = data || [];
        renderListings();
      } catch (error) {
        console.error("NOVA listings:", error);
        grid.innerHTML = `
          <div class="empty-state">
            <h3>ما قدرناش نحمّلو الإعلانات</h3>
            <p>${esc(error.message || "راجع إعدادات Supabase.")}</p>
            <button class="button" id="retry-listings" type="button">
              عاود المحاولة
            </button>
          </div>`;
        document.getElementById("retry-listings")
          ?.addEventListener("click", loadListings);
      }
    }

    function openOrderForm(listing) {
      if (listing.kind === "service") {
        // خدمات رقمية كتحتاج اتفاق واضح على طريقة التسليم.
        // يمكن طلبها كذلك، لكن نفس نموذج التوصيل قد لا يناسبها.
      }

      const old = document.getElementById("nova-order-dialog");
      if (old) old.remove();

      const dialog = document.createElement("dialog");
      dialog.id = "nova-order-dialog";
      dialog.style.cssText =
        "width:min(480px,calc(100% - 32px));border:1px solid #555;" +
        "border-radius:18px;padding:22px;background:#15172a;color:white";

      dialog.innerHTML = `
        <h2>طلب ${esc(listing.title)}</h2>
        <p>الثمن للوحدة: <strong>${price(listing.price)}</strong></p>

        <form id="nova-order-form">
          <label for="order-quantity">الكمية</label>
          <input id="order-quantity" name="quantity" type="number"
            min="1" max="100" value="1" required>

          <label for="order-phone">رقم الهاتف</label>
          <input id="order-phone" name="phone" type="tel"
            autocomplete="tel" minlength="8" maxlength="20" required>

          <label for="order-address">عنوان التوصيل</label>
          <textarea id="order-address" name="address"
            autocomplete="street-address" minlength="5"
            maxlength="500" required></textarea>

          <label for="order-note">ملاحظة (اختياري)</label>
          <textarea id="order-note" name="note" maxlength="1000"></textarea>

          <p>طريقة الأداء: <strong>الأداء عند التسليم</strong></p>
          <p id="nova-order-error" role="alert" style="color:#ff8989"></p>

          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="button button-primary" type="submit">
              تأكيد الطلب
            </button>
            <button class="button" type="button" id="close-order">
              إلغاء
            </button>
          </div>
        </form>`;

      document.body.appendChild(dialog);

      dialog.querySelector("#close-order").addEventListener("click", () => {
        dialog.close();
        dialog.remove();
      });

      dialog.addEventListener("click", event => {
        if (event.target === dialog) {
          dialog.close();
          dialog.remove();
        }
      });

      dialog.querySelector("#nova-order-form").addEventListener(
        "submit", async event => {
          event.preventDefault();

          const form = event.currentTarget;
          const submit = form.querySelector('[type="submit"]');
          const errorBox = dialog.querySelector("#nova-order-error");
          errorBox.textContent = "";

          try {
            const { data: authData, error: authError } =
              await window.novaClient.auth.getUser();

            if (authError) throw authError;

            const user = authData?.user;
            if (!user) {
              window.location.href = "login.html";
              return;
            }

            if (user.id === listing.seller_id) {
              throw new Error("ما تقدرش تطلب الإعلان ديالك.");
            }

            const quantity = Number(form.quantity.value);
            if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
              throw new Error("دخل كمية صحيحة بين 1 و100.");
            }

            const phone = form.phone.value.trim();
            const address = form.address.value.trim();
            const note = form.note.value.trim();

            if (phone.length < 8) throw new Error("دخل رقم هاتف صحيح.");
            if (address.length < 5) throw new Error("دخل عنوان التوصيل كامل.");

            submit.disabled = true;
            submit.textContent = "كنسجلو الطلب...";

            const { data, error } = await window.novaClient.rpc(
              "create_market_order",
              {
                p_listing_id: listing.id,
                p_quantity: quantity,
                p_delivery_address: address,
                p_phone: phone,
                p_note: note || null
              }
            );

            if (error) throw error;

            const orderId = Array.isArray(data) ? data[0] : data;
            if (!orderId) throw new Error("ما توصلناش بمعرّف الطلب.");

            dialog.close();
            dialog.remove();

            notice("تسجّل الطلب بنجاح! الأداء غادي يكون عند التسليم.");
            window.location.href = "orders.html";
          } catch (error) {
            console.error("NOVA order:", error);
            errorBox.textContent = error.message || "ما قدرناش نسجلو الطلب.";
            submit.disabled = false;
            submit.textContent = "تأكيد الطلب";
          }
        }
      );

      dialog.showModal();
    }

    searchInput?.addEventListener("input", renderListings);
    kindFilter?.addEventListener("change", renderListings);
    categoryFilter?.addEventListener("change", renderListings);

    grid.addEventListener("click", async event => {
      const orderButton = event.target.closest("[data-order]");
      const contactButton = event.target.closest("[data-contact]");

      if (!orderButton && !contactButton) return;

      const button = orderButton || contactButton;
      const listingId = button.dataset.order || button.dataset.contact;
      const listing = listings.find(item => item.id === listingId);

      if (!listing) {
        notice("هاد الإعلان ما بقاش متوفر.");
        return;
      }

      if (orderButton) {
        try {
          const { data: authData, error } =
            await window.novaClient.auth.getUser();

          if (error) throw error;
          if (!authData?.user) {
            window.location.href = "login.html";
            return;
          }

          openOrderForm(listing);
        } catch (error) {
          console.error(error);
          notice(error.message || "تعذر التحقق من الحساب.");
        }
        return;
      }

      try {
        const { data: authData, error: authError } =
          await window.novaClient.auth.getUser();

        if (authError) throw authError;
        if (!authData.user) {
          window.location.href = "login.html";
          return;
        }

        if (listing.seller_id === authData.user.id) {
          notice("ما تقدرش تبدا محادثة مع راسك.");
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
        if (!conversationId) throw new Error("ما قدرناش نلقاو المحادثة.");

        window.location.href =
          "messages.html?conversation=" + encodeURIComponent(conversationId);
      } catch (error) {
        console.error("NOVA conversation:", error);
        notice(error.message || "وقع مشكل ففتح المحادثة.");
        button.disabled = false;
        button.textContent = "تواصل مع البائع";
      }
    });

    loadListings();
  });
})();
