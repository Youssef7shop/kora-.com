
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", async function () {
    const client = window.novaClient;
    const form = document.getElementById("listing-form");
    const grid = document.getElementById("my-listings-grid");
    const notice = document.getElementById("dashboard-message");

    if (!form || !grid) return;

    function showMessage(message, isError = false) {
      if (notice) {
        notice.textContent = message;
        notice.className = isError ? "error-text" : "success-text";
      } else if (window.NOVA?.toast) {
        window.NOVA.toast(message);
      } else {
        alert(message);
      }
    }

    function escapeHTML(value) {
      return window.NOVA
        ? window.NOVA.esc(value)
        : String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;",
            '"': "&quot;", "'": "&#39;"
          })[char]);
    }

    function money(value) {
      if (value === null || value === undefined || value === "") {
        return "الثمن عند التواصل";
      }

      return new Intl.NumberFormat("fr-MA", {
        style: "currency",
        currency: "MAD",
        maximumFractionDigits: 2
      }).format(Number(value));
    }

    if (!client) {
      showMessage(
        "Supabase ما متهيّأش. راجع js/supabase-config.js.",
        true
      );
      grid.innerHTML = `<div class="empty-state">خاصك تربط قاعدة البيانات أولاً.</div>`;
      return;
    }

    let currentUser;

    try {
      const { data, error } = await client.auth.getUser();

      if (error) throw error;

      currentUser = data.user;

      if (!currentUser) {
        window.location.replace("login.html");
        return;
      }
    } catch (error) {
      console.error(error);
      showMessage("ما قدرناش نتحققو من الحساب ديالك.", true);
      return;
    }

    async function loadMyListings() {
      grid.innerHTML = `<p class="muted">كنحمّلو الإعلانات...</p>`;

      try {
        const { data, error } = await client
          .from("listings")
          .select("id, kind, title, description, price, category, image_url, city, status, created_at")
          .eq("seller_id", currentUser.id)
          .order("created_at", { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
          grid.innerHTML = `
            <div class="empty-state">
              <h3>ما عندك حتى إعلان دابا</h3>
              <p>نشر أول منتج أو خدمة ديالك باستعمال الفورم اللي فوق.</p>
            </div>
          `;
          return;
        }

        grid.innerHTML = data.map(item => `
          <article class="listing-card">
            <div class="listing-image">
              ${
                item.image_url
                  ? `<img src="${escapeHTML(item.image_url)}"
                           alt="${escapeHTML(item.title)}"
                           loading="lazy"
                           onerror="this.style.display='none'">`
                  : `<span class="listing-placeholder">✦</span>`
              }
            </div>

            <div class="listing-content">
              <span class="pill">
                ${escapeHTML(item.status === "active" ? "نشط" : item.status)}
              </span>

              <h3>${escapeHTML(item.title)}</h3>
              <p>${escapeHTML(item.description || "")}</p>

              <div class="listing-meta">
                <span class="price">${money(item.price)}</span>
                <span class="pill">${escapeHTML(item.category || "أخرى")}</span>
              </div>

              <button
                type="button"
                class="button"
                data-delete-listing="${escapeHTML(item.id)}"
              >
                حذف الإعلان
              </button>
            </div>
          </article>
        `).join("");
      } catch (error) {
        console.error("Load listings error:", error);
        grid.innerHTML = `
          <div class="empty-state">
            ما قدرناش نحمّلو الإعلانات. تأكد من قاعدة البيانات وسياسات RLS.
          </div>
        `;
      }
    }

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      const submitButton = form.querySelector('[type="submit"]');
      const originalText = submitButton?.textContent || "نشر الإعلان";

      const values = new FormData(form);
      const title = String(values.get("title") || "").trim();
      const description = String(values.get("description") || "").trim();
      const kind = String(values.get("kind") || "product");
      const category = String(values.get("category") || "أخرى");
      const city = String(values.get("city") || "").trim();
      const imageUrl = String(values.get("image_url") || "").trim();
      const priceText = String(values.get("price") || "").trim();
      const quantity = Number(values.get("quantity") || 1);

      if (!title || !description) {
        showMessage("دخل عنوان الإعلان والوصف.", true);
        return;
      }

      if (!["product", "service"].includes(kind)) {
        showMessage("نوع الإعلان غير صحيح.", true);
        return;
      }

      if (priceText !== "" && (!Number.isFinite(Number(priceText)) || Number(priceText) < 0)) {
        showMessage("دخل ثمن صحيح.", true);
        return;
      }

      if (!Number.isInteger(quantity) || quantity < 1) {
        showMessage("الكمية خاصها تكون عدد صحيح أكبر من صفر.", true);
        return;
      }

      if (imageUrl) {
        try {
          const parsedUrl = new URL(imageUrl);
          if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
            throw new Error("Invalid URL protocol");
          }
        } catch {
          showMessage("رابط الصورة غير صحيح.", true);
          return;
        }
      }

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "كننشرو الإعلان...";
      }

      try {
        const { error } = await client
          .from("listings")
          .insert({
            seller_id: currentUser.id,
            kind,
            title,
            description,
            category,
            city: city || null,
            image_url: imageUrl || null,
            price: priceText === "" ? null : Number(priceText),
            quantity,
            status: "active"
          });

        if (error) throw error;

        form.reset();
        showMessage("تنشر الإعلان بنجاح!");
        await loadMyListings();
      } catch (error) {
        console.error("Create listing error:", error);
        showMessage(
          error.message || "ما قدرناش ننشرو الإعلان. راجع SQL وسياسات RLS.",
          true
        );
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = originalText;
        }
      }
    });

    grid.addEventListener("click", async function (event) {
      const button = event.target.closest("[data-delete-listing]");
      if (!button) return;

      const listingId = button.dataset.deleteListing;

      if (!window.confirm("واش متأكد بغيتي تحذف هاد الإعلان؟")) return;

      button.disabled = true;
      button.textContent = "كنحذفو...";

      try {
        const { error } = await client
          .from("listings")
          .delete()
          .eq("id", listingId)
          .eq("seller_id", currentUser.id);

        if (error) throw error;

        showMessage("تحذف الإعلان.");
        await loadMyListings();
      } catch (error) {
        console.error("Delete listing error:", error);
        showMessage("ما قدرناش نحذفو الإعلان. راجع الصلاحيات.", true);
        button.disabled = false;
        button.textContent = "حذف الإعلان";
      }
    });

    await loadMyListings();
  });
})();
