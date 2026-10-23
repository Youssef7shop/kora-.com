
// js/auth.js
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");
    const googleButton = document.getElementById("google-login");
    const message = document.getElementById("auth-message");

    function getClient() {
      return window.novaClient || window.supabaseClient || null;
    }

    function showMessage(text, type = "error") {
      if (!message) return;

      message.textContent = text;
      message.style.color =
        type === "success" ? "#22c55e" : "#f87171";
    }

    function friendlyError(error) {
      const msg = String(error?.message || "").toLowerCase();

      if (msg.includes("invalid login credentials")) {
        return "الإيميل أو كلمة السر غير صحيحة.";
      }

      if (msg.includes("email not confirmed")) {
        return "خاصك تأكد الإيميل ديالك قبل تسجيل الدخول.";
      }

      if (msg.includes("user already registered")) {
        return "هاد الإيميل مسجل من قبل. جرّب تسجيل الدخول.";
      }

      if (
        msg.includes("network") ||
        msg.includes("fetch")
      ) {
        return "تعذر الاتصال. تأكد من الإنترنت وإعدادات Supabase.";
      }

      return error?.message || "وقع خطأ. عاود المحاولة.";
    }

    function setLoading(button, loading, originalText) {
      if (!button) return;

      button.disabled = loading;
      button.textContent = loading
        ? "عافاك تسنى..."
        : originalText;
    }

    async function redirectByRole() {
      const client = getClient();

      if (!client?.auth) {
        throw new Error("Supabase ما تهيّأش.");
      }

      const { data: sessionData, error: sessionError } =
        await client.auth.getSession();

      if (sessionError) throw sessionError;

      const user = sessionData.session?.user;

      if (!user) {
        window.location.replace("login.html");
        return;
      }

      const { data: profile, error: profileError } =
        await client
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

      if (profileError) throw profileError;

      const role = String(profile?.role || "client")
        .trim()
        .toLowerCase();

      if (role === "admin" || role === "super_admin") {
        window.location.replace("admin.html");
      } else {
        window.location.replace("dashboard.html");
      }
    }

    // تسجيل الدخول بالإيميل وكلمة السر
    if (loginForm) {
      loginForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const client = getClient();

        if (!client?.auth) {
          showMessage("Supabase ما تهيّأش. راجع إعدادات الاتصال.");
          return;
        }

        const formData = new FormData(loginForm);
        const email = String(formData.get("email") || "")
          .trim();
        const password = String(formData.get("password") || "");

        const submitButton = loginForm.querySelector(
          'button[type="submit"]'
        );
        const originalText = submitButton?.textContent ||
          "تسجيل الدخول";

        try {
          setLoading(submitButton, true, originalText);
          showMessage("جاري تسجيل الدخول...", "success");

          const { error } = await client.auth.signInWithPassword({
            email,
            password
          });

          if (error) throw error;

          await redirectByRole();
        } catch (error) {
          console.error("[NOVA] Login error:", error);
          showMessage(friendlyError(error));
          setLoading(submitButton, false, originalText);
        }
      });
    }

    // إنشاء حساب جديد
    if (registerForm) {
      registerForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const client = getClient();

        if (!client?.auth) {
          showMessage("Supabase ما تهيّأش. راجع إعدادات الاتصال.");
          return;
        }

        const formData = new FormData(registerForm);
        const firstName = String(
          formData.get("first_name") || ""
        ).trim();
        const lastName = String(
          formData.get("last_name") || ""
        ).trim();
        const email = String(formData.get("email") || "").trim();
        const password = String(formData.get("password") || "");
        const confirmPassword = String(
          formData.get("confirm_password") || ""
        );

        if (password.length < 8) {
          showMessage("كلمة السر خاصها تكون على الأقل 8 أحرف.");
          return;
        }

        if (password !== confirmPassword) {
          showMessage("كلمتا السر ما متطابقتينش.");
          return;
        }

        const submitButton = registerForm.querySelector(
          'button[type="submit"]'
        );
        const originalText = submitButton?.textContent ||
          "إنشاء الحساب";

        try {
          setLoading(submitButton, true, originalText);

          const { data, error } = await client.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: window.location.origin + "/login.html",
              data: {
                first_name: firstName,
                last_name: lastName,
                display_name: `${firstName} ${lastName}`.trim()
              }
            }
          });

          if (error) throw error;

          if (data.session) {
            showMessage("تسجل الحساب بنجاح. جاري تحويلك...", "success");
            await redirectByRole();
          } else {
            showMessage(
              "تسجل الحساب. راجع الإيميل ديالك باش تأكد التسجيل.",
              "success"
            );
            setLoading(submitButton, false, originalText);
          }
        } catch (error) {
          console.error("[NOVA] Registration error:", error);
          showMessage(friendlyError(error));
          setLoading(submitButton, false, originalText);
        }
      });
    }

    // تسجيل الدخول بواسطة Google
    if (googleButton) {
      googleButton.addEventListener("click", async function () {
        const client = getClient();

        if (!client?.auth) {
          showMessage("Supabase ما تهيّأش. راجع إعدادات الاتصال.");
          return;
        }

        const originalText = googleButton.textContent ||
          "المتابعة باستخدام Google";

        try {
          setLoading(googleButton, true, originalText);

          const { error } = await client.auth.signInWithOAuth({
            provider: "google",
            options: {
              redirectTo:
                window.location.origin + "/dashboard.html"
            }
          });

          if (error) throw error;
        } catch (error) {
          console.error("[NOVA] Google login error:", error);
          showMessage(friendlyError(error));
          setLoading(googleButton, false, originalText);
        }
      });
    }

    // إذا كان المستخدم مسجل الدخول من قبل، نوجّهو حسب الدور
    async function checkExistingSession() {
      const client = getClient();

      if (!client?.auth) {
        console.error("[NOVA] Supabase client غير موجود.");
        return;
      }

      const isAuthPage =
        loginForm || registerForm;

      if (!isAuthPage) return;

      try {
        const { data, error } = await client.auth.getSession();

        if (error) throw error;

        if (data.session?.user) {
          await redirectByRole();
        }
      } catch (error) {
        console.error("[NOVA] Session check error:", error);
      }
    }

    checkExistingSession();
  });
})();