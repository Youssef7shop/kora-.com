
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", async function () {
    const client = window.novaClient;
    const form = document.getElementById("profile-form");
    const notice = document.getElementById("profile-notice");
    const saveButton = document.getElementById("save-profile");

    const nameInput = document.getElementById("display-name");
    const emailInput = document.getElementById("email");
    const cityInput = document.getElementById("city");
    const avatarInput = document.getElementById("avatar-url");

    const avatar = document.getElementById("profile-avatar");
    const headingName = document.getElementById("profile-heading-name");
    const headingEmail = document.getElementById("profile-heading-email");
    const providerLabel = document.getElementById("profile-provider");

    const fallbackAvatar =
      "https://i.postimg.cc/prbmgQVZ/Logo-N-futuriste-aux-teintes-neon.png";

    let user = null;
    let originalProfile = {};

    function showMessage(message, isError = false) {
      notice.textContent = message;
      notice.classList.toggle("error", isError);
      notice.classList.add("show");
    }

    function setAvatar(url) {
      avatar.src = url || fallbackAvatar;
      avatar.onerror = function () {
        this.onerror = null;
        this.src = fallbackAvatar;
      };
    }

    try {
      if (!client) {
        throw new Error("Supabase مازال ما متهيّأش. راجع الإعدادات.");
      }

      const { data, error } = await client.auth.getUser();
      if (error) throw error;

      user = data.user;

      if (!user) {
        window.location.href = "login.html";
        return;
      }

      const metadata = user.user_metadata || {};

      const provider =
        user.app_metadata?.provider ||
        user.identities?.[0]?.provider ||
        "email";

      const metadataName =
        metadata.full_name ||
        metadata.name ||
        [metadata.first_name, metadata.last_name].filter(Boolean).join(" ");

      const metadataAvatar =
        metadata.avatar_url ||
        metadata.picture ||
        "";

      let profile = null;

      const { data: profileData, error: profileError } = await client
        .from("profiles")
        .select("id, display_name, avatar_url, city")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error("NOVA profile read:", profileError);
        showMessage(
          "تعذر تحميل بعض بيانات البروفايل. راجع صلاحيات جدول profiles.",
          true
        );
      } else {
        profile = profileData;
      }

      const name =
        profile?.display_name ||
        metadataName ||
        (user.email ? user.email.split("@")[0] : "المستخدم");

      const image = profile?.avatar_url || metadataAvatar || fallbackAvatar;

      originalProfile = {
        display_name: name,
        avatar_url: profile?.avatar_url || "",
        city: profile?.city || ""
      };

      nameInput.value = name;
      emailInput.value = user.email || "";
      cityInput.value = originalProfile.city;
      avatarInput.value = originalProfile.avatar_url;

      headingName.textContent = name;
      headingEmail.textContent = user.email || "";
      setAvatar(image);

      providerLabel.textContent =
        provider === "google" ? "مسجّل الدخول بواسطة Google" :
        provider === "email" ? "حساب بالبريد الإلكتروني" :
        "حساب NOVA MARKET";

    } catch (error) {
      console.error("NOVA profile:", error);
      showMessage(error.message || "وقع مشكل فتحميل الحساب.", true);
    }

    avatarInput.addEventListener("input", function () {
      const url = avatarInput.value.trim();

      if (!url) {
        setAvatar(fallbackAvatar);
        return;
      }

      try {
        const parsed = new URL(url);

        if (parsed.protocol === "https:" || parsed.protocol === "http:") {
          setAvatar(parsed.href);
        }
      } catch (_) {
        // ما نبدلوش الصورة حتى يكون الرابط صالح
      }
    });

    nameInput.addEventListener("input", function () {
      headingName.textContent = nameInput.value.trim() || "المستخدم";
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      if (!user || !client) {
        showMessage("خاصك تدخل للحساب أولاً.", true);
        return;
      }

      const displayName = nameInput.value.trim();
      const city = cityInput.value.trim();
      const avatarUrl = avatarInput.value.trim();

      if (!displayName) {
        showMessage("كتب الاسم الكامل ديالك.", true);
        return;
      }

      if (avatarUrl) {
        try {
          const parsed = new URL(avatarUrl);

          if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
            throw new Error("invalid URL");
          }
        } catch (_) {
          showMessage("رابط الصورة ماشي صالح.", true);
          return;
        }
      }

      saveButton.disabled = true;
      saveButton.textContent = "كنحفظو...";

      try {
        const updates = {
          id: user.id,
          display_name: displayName,
          avatar_url: avatarUrl || null,
          city: city || null,
          updated_at: new Date().toISOString()
        };

        const { error } = await client
          .from("profiles")
          .upsert(updates, { onConflict: "id" });

        if (error) throw error;

        // تحديث البيانات الوصفية ديال المستخدم كذلك
        const { error: metadataError } = await client.auth.updateUser({
          data: {
            full_name: displayName,
            avatar_url: avatarUrl || null,
            city: city || null
          }
        });

        if (metadataError) {
          console.warn("NOVA metadata update:", metadataError);
        }

        originalProfile = {
          display_name: displayName,
          avatar_url: avatarUrl,
          city: city
        };

        headingName.textContent = displayName;
        headingEmail.textContent = user.email || "";
        setAvatar(avatarUrl || fallbackAvatar);

        showMessage("تحفظات معلومات البروفايل بنجاح.");

      } catch (error) {
        console.error("NOVA profile save:", error);
        showMessage(
          "ما قدرناش نحفظو المعلومات: " +
          (error.message || "خطأ غير معروف") +
          ". تأكد من جدول profiles وسياسات RLS.",
          true
        );
      } finally {
        saveButton.disabled = false;
        saveButton.textContent = "حفظ التغييرات";
      }
    });
  });
})();
