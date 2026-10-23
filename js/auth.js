
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    const client = window.novaClient;

    const registerForm = document.getElementById("register-form");
    const loginForm = document.getElementById("login-form");
    const googleButton = document.getElementById("google-login");
    const message = document.getElementById("auth-message");

    function showMessage(text, isError = true) {
      if (message) {
        message.textContent = text;
        message.className = isError ? "error-text" : "success-text";
        message.setAttribute("role", "status");
      } else if (window.NOVA) {
        window.NOVA.toast(text);
      } else {
        alert(text);
      }
    }

    function setLoading(form, loading) {
      if (!form) return;

      const submit = form.querySelector('[type="submit"]');

      if (submit) {
        if (loading) {
          submit.dataset.originalText = submit.textContent;
          submit.textContent = "عفاك تسنى...";
        } else {
          submit.textContent =
            submit.dataset.originalText || "متابعة";
        }

        submit.disabled = loading;
      }
    }

    function friendlyError(error) {
      const text = String(error?.message || "");

      if (/invalid login credentials/i.test(text)) {
        return "الإيميل أو كلمة السر غير صحيحة.";
      }

      if (/user already registered/i.test(text)) {
        return "هاد الإيميل مسجل من قبل. دخل لحسابك.";
      }

      if (/password should be at least/i.test(text)) {
        return "كلمة السر خاصها تكون أطول.";
      }

      if (/email not confirmed/i.test(text)) {
        return "أكد الإيميل ديالك قبل تسجيل الدخول.";
      }

      if (/rate limit/i.test(text)) {
        return "طلبات كثيرة. تسنى شوية وعاود المحاولة.";
      }

      return text || "وقع خطأ غير متوقع. عاود المحاولة.";
    }

    if (!client && (registerForm || loginForm || googleButton)) {
      showMessage(
        "Supabase ما متهيّأش. راجع js/supabase-config.js."
      );
      return;
    }

    // إنشاء حساب جديد
    if (registerForm) {
      registerForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const form = event.currentTarget;
        const firstName =
          form.querySelector('[name="first_name"]')?.value.trim() || "";
        const lastName =
          form.querySelector('[name="last_name"]')?.value.trim() || "";
        const email =
          form.querySelector('[name="email"]')?.value.trim() || "";
        const password =
          form.querySelector('[name="password"]')?.value || "";
        const confirmPassword =
          form.querySelector('[name="confirm_password"]')?.value || "";

        if (!firstName || !lastName || !email) {
          showMessage("عمر المعلومات المطلوبة كاملة.");
          return;
        }

        if (password.length < 8) {
          showMessage("كلمة السر خاصها تكون 8 حروف على الأقل.");
          return;
        }

        if (password !== confirmPassword) {
          showMessage("كلمتا السر ما متطابقينش.");
          return;
        }

        setLoading(form, true);

        try {
          const { data, error } = await client.auth.signUp({
            email,
            password,
            options: {
              data: {
                first_name: firstName,
                last_name: lastName,
                display_name: firstName + " " + lastName
              },
              emailRedirectTo: window.location.origin + "/login.html"
            }
          });

          if (error) throw error;

          if (data.session) {
            showMessage("الحساب تخلق بنجاح! غادي نمشيو لحسابك.", false);
            window.location.href = "dashboard.html";
          } else {
            showMessage(
              "تسجلتي بنجاح! شوف الإيميل ديالك باش تأكد الحساب.",
              false
            );
          }
        } catch (error) {
          showMessage(friendlyError(error));
        } finally {
          setLoading(form, false);
        }
      });
    }

    // تسجيل الدخول
    if (loginForm) {
      loginForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const form = event.currentTarget;
        const email =
          form.querySelector('[name="email"]')?.value.trim() || "";
        const password =
          form.querySelector('[name="password"]')?.value || "";

        if (!email || !password) {
          showMessage("دخل الإيميل وكلمة السر.");
          return;
        }

        setLoading(form, true);

        try {
          const { error } = await client.auth.signInWithPassword({
            email,
            password
          });

          if (error) throw error;

          window.location.href = "dashboard.html";
        } catch (error) {
          showMessage(friendlyError(error));
        } finally {
          setLoading(form, false);
        }
      });
    }

    // تسجيل الدخول بواسطة Google
    if (googleButton) {
      googleButton.addEventListener("click", async function () {
        googleButton.disabled = true;

        try {
          const { data, error } = await client.auth.signInWithPassword({
  email,
  password
});

if (error) throw error;

const user = data.user;

const { data: profile, error: profileError } = await client
  .from("profiles")
  .select("role")
  .eq("id", user.id)
  .maybeSingle();

if (profileError) {
  console.error("Profile role lookup failed:", profileError);
  showMessage("تعذر التحقق من صلاحيات الحساب. تواصل مع الإدارة.");
  return;
}

if (profile?.role === "ADMIN" || profile?.role === "SUPER_ADMIN") {
  window.location.href = "/admin";
} else {
  window.location.href = "/dashboard";
}
            }
          });

          if (error) throw error;
        } catch (error) {
          showMessage(friendlyError(error));
          googleButton.disabled = false;
        }
      });
    }
  });
})();
