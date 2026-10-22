// ============================================================
// NOVA MARKET - Messages System
// File: public/js/messages.js
// Supabase Auth + Conversations + Messages + Realtime
// ============================================================

(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", async function () {
    const client = window.novaClient;

    // عناصر الصفحة
    const conversationList = document.getElementById("conversation-list");
    const chatTitle = document.getElementById("chat-title");
    const chatMessages = document.getElementById("chat-messages");
    const messageForm = document.getElementById("message-form");
    const messageInput = document.getElementById("message-input");
    const notice = document.getElementById("messages-notice");

    if (
      !conversationList ||
      !chatTitle ||
      !chatMessages ||
      !messageForm ||
      !messageInput
    ) {
      console.error(
        "NOVA MARKET: عناصر المحادثات ناقصة في messages.html."
      );
      return;
    }

    let currentUser = null;
    let conversations = [];
    let activeConversationId = null;
    let realtimeChannel = null;
    let sendingMessage = false;
    let loadingConversationId = null;
    let pageDestroyed = false;

    const renderedMessageIds = new Set();

    // ============================================================
    // أدوات مساعدة
    // ============================================================

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
      if (notice) {
        notice.textContent = message;
        notice.className = isError ? "error-text" : "success-text";
        notice.hidden = false;
        return;
      }

      if (typeof window.NOVA?.toast === "function") {
        window.NOVA.toast(message);
      } else {
        console.log(message);
      }
    }

    function clearNotice() {
      if (!notice) return;

      notice.textContent = "";
      notice.hidden = true;
    }

    function formatDate(value) {
      if (!value) return "";

      const date = new Date(value);

      if (Number.isNaN(date.getTime())) return "";

      return new Intl.DateTimeFormat("ar-MA", {
        dateStyle: "short",
        timeStyle: "short"
      }).format(date);
    }

    function getListingTitle(conversation) {
      const listing = conversation?.listings;

      if (Array.isArray(listing)) {
        return listing[0]?.title || "محادثة NOVA MARKET";
      }

      return listing?.title || "محادثة NOVA MARKET";
    }

    function renderEmptyMessages(message) {
      chatMessages.innerHTML = "";

      const wrapper = document.createElement("div");
      wrapper.className = "empty-state";

      const paragraph = document.createElement("p");
      paragraph.textContent = message;

      wrapper.appendChild(paragraph);
      chatMessages.appendChild(wrapper);
    }

    function scrollMessagesToBottom() {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function setComposerEnabled(enabled) {
      messageInput.disabled = !enabled;

      const submitButton = messageForm.querySelector(
        'button[type="submit"], button:not([type])'
      );

      if (submitButton) {
        submitButton.disabled = !enabled || sendingMessage;
      }
    }

    function normalizeConversation(row) {
      if (!row) return null;

      const conversation = Array.isArray(row.conversations)
        ? row.conversations[0]
        : row.conversations;

      if (!conversation) return null;

      return {
        ...conversation,
        id: conversation.id || row.conversation_id
      };
    }

    // ============================================================
    // Supabase والتحقق من المستخدم
    // ============================================================

    if (!client) {
      showNotice(
        "Supabase ما متهيّأش. راجع js/supabase-config.js.",
        true
      );

      renderEmptyMessages("خاصك تربط قاعدة البيانات أولاً.");
      setComposerEnabled(false);
      return;
    }

    setComposerEnabled(false);

    try {
      const { data, error } = await client.auth.getUser();

      if (error) throw error;

      currentUser = data?.user || null;

      if (!currentUser) {
        window.location.replace("login.html");
        return;
      }
    } catch (error) {
      console.error("NOVA MARKET Auth Error:", error);

      showNotice(
        "ما قدرناش نتحققو من الحساب ديالك. عاود سجّل الدخول.",
        true
      );

      renderEmptyMessages("خاصك تسجّل الدخول باش تستعمل الرسائل.");
      return;
    }

    // ============================================================
    // جلب المحادثات ديال المستخدم
    // ============================================================

    async function loadConversations() {
      conversationList.innerHTML = "";

      const loading = document.createElement("p");
      loading.className = "muted";
      loading.textContent = "كنحمّلو المحادثات...";
      conversationList.appendChild(loading);

      try {
        const { data, error } = await client
          .from("conversation_members")
          .select(`
            conversation_id,
            conversations (
              id,
              listing_id,
              updated_at,
              listings (
                title
              )
            )
          `)
          .eq("user_id", currentUser.id);

        if (error) throw error;

        const unique = new Map();

        (data || []).forEach(function (row) {
          const conversation = normalizeConversation(row);

          if (conversation?.id) {
            unique.set(conversation.id, conversation);
          }
        });

        conversations = Array.from(unique.values()).sort(function (a, b) {
          return (
            new Date(b.updated_at || 0) -
            new Date(a.updated_at || 0)
          );
        });

        renderConversationList();

        return conversations;
      } catch (error) {
        console.error("Load conversations error:", error);

        conversationList.innerHTML = "";

        const errorBox = document.createElement("div");
        errorBox.className = "empty-state";

        const title = document.createElement("p");
        title.textContent = "ما قدرناش نحمّلو المحادثات.";

        const detail = document.createElement("small");
        detail.textContent = "راجع الاتصال وقواعد RLS فـ Supabase.";

        errorBox.append(title, detail);
        conversationList.appendChild(errorBox);

        showNotice(
          "وقع مشكل فتحميل المحادثات. راجع إعدادات Supabase.",
          true
        );

        return [];
      }
    }

    // ============================================================
    // عرض لائحة المحادثات
    // ============================================================

    function renderConversationList() {
      conversationList.innerHTML = "";

      if (!conversations.length) {
        const empty = document.createElement("div");
        empty.className = "empty-state";

        const title = document.createElement("h3");
        title.textContent = "ما عندك حتى محادثة";

        const description = document.createElement("p");
        description.textContent =
          "اختار منتج أو خدمة وحاول تتواصل مع البائع.";

        empty.append(title, description);
        conversationList.appendChild(empty);
        return;
      }

      conversations.forEach(function (conversation) {
        const isActive =
          conversation.id === activeConversationId;

        const button = document.createElement("button");
        button.type = "button";
        button.className =
          "conversation-item" + (isActive ? " active" : "");

        button.dataset.conversationId = conversation.id;
        button.setAttribute(
          "aria-current",
          isActive ? "true" : "false"
        );

        const avatar = document.createElement("span");
        avatar.className = "conversation-avatar";
        avatar.setAttribute("aria-hidden", "true");
        avatar.textContent = "✦";

        const info = document.createElement("span");
        info.className = "conversation-info";

        const title = document.createElement("strong");
        title.textContent = getListingTitle(conversation);

        const date = document.createElement("small");
        date.textContent = formatDate(conversation.updated_at);

        info.append(title, date);
        button.append(avatar, info);

        conversationList.appendChild(button);
      });
    }

    // ============================================================
    // التحقق من عضوية المحادثة
    // ============================================================

    async function isConversationMember(conversationId) {
      const { data, error } = await client
        .from("conversation_members")
        .select("conversation_id")
        .eq("conversation_id", conversationId)
        .eq("user_id", currentUser.id)
        .maybeSingle();

      if (error) throw error;

      return Boolean(data);
    }

    // ============================================================
    // عرض رسالة بأمان
    // ============================================================

    function renderMessage(message) {
      if (!message || !message.id) return;

      const messageId = String(message.id);

      if (renderedMessageIds.has(messageId)) return;

      renderedMessageIds.add(messageId);

      const isMine = message.sender_id === currentUser.id;

      const wrapper = document.createElement("div");
      wrapper.className = isMine
        ? "chat-message mine"
        : "chat-message";

      wrapper.dataset.messageId = messageId;

      const body = document.createElement("p");
      body.className = "chat-message-body";
      body.textContent = message.body || "";

      const time = document.createElement("small");
      time.className = "chat-message-time";
      time.textContent = formatDate(message.created_at);

      wrapper.append(body, time);
      chatMessages.appendChild(wrapper);
    }

    // ============================================================
    // تحميل رسائل المحادثة
    // ============================================================

    async function loadMessages(conversationId) {
      loadingConversationId = conversationId;
      renderedMessageIds.clear();

      chatMessages.innerHTML = "";

      const loading = document.createElement("p");
      loading.className = "muted";
      loading.textContent = "كنحمّلو الرسائل...";
      chatMessages.appendChild(loading);

      try {
        // تحقق من العضوية قبل جلب الرسائل
        const member = await isConversationMember(conversationId);

        if (activeConversationId !== conversationId) return;

        if (!member) {
          renderEmptyMessages(
            "ما عندكش الصلاحية تشوف هاد المحادثة."
          );
          return;
        }

        const { data, error } = await client
          .from("messages")
          .select(
            "id, conversation_id, sender_id, body, created_at"
          )
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true });

        if (error) throw error;

        // منع نتيجة طلب قديم من تبديل المحادثة الحالية
        if (activeConversationId !== conversationId) return;

        chatMessages.innerHTML = "";

        if (!data || data.length === 0) {
          renderEmptyMessages(
            "ما كايناش رسائل دابا. صيفط أول رسالة!"
          );
          return;
        }

        data.forEach(renderMessage);
        scrollMessagesToBottom();
      } catch (error) {
        console.error("Load messages error:", error);

        if (activeConversationId === conversationId) {
          renderEmptyMessages("ما قدرناش نحمّلو الرسائل.");

          showNotice(
            "تعذر تحميل الرسائل. تأكد من صلاحيات قاعدة البيانات.",
            true
          );
        }
      } finally {
        if (loadingConversationId === conversationId) {
          loadingConversationId = null;
        }
      }
    }

    // ============================================================
    // Realtime: استقبال الرسائل الجديدة
    // ============================================================

    async function unsubscribeFromMessages() {
      if (!realtimeChannel) return;

      const oldChannel = realtimeChannel;
      realtimeChannel = null;

      try {
        await client.removeChannel(oldChannel);
      } catch (error) {
        console.warn("Realtime cleanup warning:", error);
      }
    }

    async function subscribeToMessages(conversationId) {
      await unsubscribeFromMessages();

      if (
        pageDestroyed ||
        activeConversationId !== conversationId
      ) {
        return;
      }

      realtimeChannel = client
        .channel("nova-messages-" + conversationId)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: "conversation_id=eq." + conversationId
          },
          function (payload) {
            if (
              pageDestroyed ||
              activeConversationId !== conversationId
            ) {
              return;
            }

            const message = payload.new;

            if (
              !message ||
              message.conversation_id !== conversationId
            ) {
              return;
            }

            const emptyState =
              chatMessages.querySelector(".empty-state");

            if (emptyState) {
              chatMessages.innerHTML = "";
            }

            renderMessage(message);
            scrollMessagesToBottom();

            const conversation = conversations.find(
              item => item.id === conversationId
            );

            if (conversation) {
              conversation.updated_at =
                message.created_at || new Date().toISOString();

              conversations.sort(function (a, b) {
                return (
                  new Date(b.updated_at || 0) -
                  new Date(a.updated_at || 0)
                );
              });

              renderConversationList();
            }
          }
        )
        .subscribe(function (status) {
          if (status === "CHANNEL_ERROR") {
            console.error(
              "NOVA MARKET: Realtime channel error."
            );
          }

          if (status === "TIMED_OUT") {
            console.warn(
              "NOVA MARKET: Realtime connection timed out."
            );
          }
        });
    }

    // ============================================================
    // فتح محادثة موجودة
    // ============================================================

    async function openConversation(conversationId) {
      if (!conversationId) return;

      const conversation = conversations.find(
        item => item.id === conversationId
      );

      if (!conversation) {
        showNotice(
          "المحادثة ما لقاينهاش فالحساب ديالك.",
          true
        );
        return;
      }

      clearNotice();

      activeConversationId = conversationId;

      chatTitle.textContent = getListingTitle(conversation);

      renderConversationList();
      setComposerEnabled(true);

      // نربط Realtime ونحمّل الرسائل
      await subscribeToMessages(conversationId);

      if (activeConversationId !== conversationId) return;

      await loadMessages(conversationId);

      if (activeConversationId === conversationId) {
        messageInput.focus();
      }
    }

    // ============================================================
    // البحث عن محادثة مشتركة بين المشتري والبائع
    // ============================================================

    async function findSharedConversation(otherUserId) {
      const { data: myMemberships, error: myError } = await client
        .from("conversation_members")
        .select("conversation_id")
        .eq("user_id", currentUser.id);

      if (myError) throw myError;

      const myIds = (myMemberships || [])
        .map(item => item.conversation_id)
        .filter(Boolean);

      if (!myIds.length) return null;

      // نقسم المعرفات باش نتفاداو طلب كبير بزاف
      const chunkSize = 100;

      for (let i = 0; i < myIds.length; i += chunkSize) {
        const chunk = myIds.slice(i, i + chunkSize);

        const { data: otherMemberships, error: otherError } =
          await client
            .from("conversation_members")
            .select("conversation_id")
            .eq("user_id", otherUserId)
            .in("conversation_id", chunk);

        if (otherError) throw otherError;

        const shared = (otherMemberships || []).find(
          item => item.conversation_id
        );

        if (shared) return shared.conversation_id;
      }

      return null;
    }

    // ============================================================
    // فتح الرسائل من رابط الطلب
    // URL: messages.html?order=ORDER_ID
    // ============================================================

    async function openOrderConversation(orderId) {
      clearNotice();
      setComposerEnabled(false);

      try {
        // جلب الطلب؛ RLS خاصها تسمح للمشتري والبائع يشوفوه
        const { data: order, error } = await client
          .from("orders")
          .select("id, buyer_id, seller_id")
          .eq("id", orderId)
          .maybeSingle();

        if (error) throw error;

        if (!order) {
          renderEmptyMessages(
            "الطلب ما لقايناهش، أو ما عندكش الصلاحية تشوفو."
          );
          return;
        }

        const isBuyer = order.buyer_id === currentUser.id;
        const isSeller = order.seller_id === currentUser.id;

        if (!isBuyer && !isSeller) {
          renderEmptyMessages(
            "هاد الطلب ماشي تابع للحساب ديالك."
          );
          return;
        }

        const otherUserId = isBuyer
          ? order.seller_id
          : order.buyer_id;

        if (!otherUserId) {
          renderEmptyMessages(
            "ما قدرناش نحددو الطرف الآخر ديال الطلب."
          );
          return;
        }

        // كنقلبو على محادثة موجودة بين المشتري والبائع
        const sharedConversationId =
          await findSharedConversation(otherUserId);

        if (sharedConversationId) {
          // نعاودو نحمّلو اللائحة باش تكون المحادثة متاحة
          await loadConversations();

          const exists = conversations.some(
            item => item.id === sharedConversationId
          );

          if (exists) {
            await openConversation(sharedConversationId);
            return;
          }
        }

        /*
         * ما كننشئوش conversation ولا members من الواجهة هنا،
         * حيت خاص الإنشاء يكون متوافق مع schema وRLS.
         */
        renderEmptyMessages(
          "ما كايناش محادثة سابقة بينك وبين الطرف الآخر. " +
          "خاص تفعيل إنشاء محادثة للطلب فـ Supabase."
        );

        showNotice(
          "ما لقيناش محادثة موجودة لهاد الطلب. إنشاء محادثة جديدة باقي خاصو الإعداد.",
          true
        );
      } catch (error) {
        console.error("Open order conversation error:", error);

        renderEmptyMessages(
          "ما قدرناش نفتح محادثة الطلب."
        );

        showNotice(
          "تعذر فتح الطلب. تأكد من جداول orders و conversation_members وسياسات RLS.",
          true
        );
      }
    }

    // ============================================================
    // فتح المحادثة حسب الرابط
    // ============================================================

    async function openInitialConversation() {
      const params = new URLSearchParams(window.location.search);

      const requestedConversationId = params.get("conversation");
      const requestedOrderId = params.get("order");

      // أولوية رابط المحادثة
      if (requestedConversationId) {
        const found = conversations.find(
          item => item.id === requestedConversationId
        );

        if (found) {
          await openConversation(found.id);
        } else {
          renderEmptyMessages(
            "المحادثة المطلوبة ما لقاينهاش فحسابك."
          );

          showNotice(
            "تأكد من رابط المحادثة ومن صلاحيات الحساب.",
            true
          );
        }

        return;
      }

      // رابط الطلب
      if (requestedOrderId) {
        await openOrderConversation(requestedOrderId);
        return;
      }

      // ما كاين حتى رابط: نفتح أول محادثة
      if (conversations.length) {
        await openConversation(conversations[0].id);
      } else {
        renderEmptyMessages(
          "اختار منتج أو خدمة وبدا التواصل مع البائع."
        );
      }
    }

    // ============================================================
    // الضغط على عنصر من لائحة المحادثات
    // ============================================================

    conversationList.addEventListener("click", async function (event) {
      const button = event.target.closest("[data-conversation-id]");

      if (!button) return;

      const conversationId = button.dataset.conversationId;

      if (
        !conversationId ||
        conversationId === activeConversationId
      ) {
        return;
      }

      await openConversation(conversationId);
    });

    // ============================================================
    // إرسال رسالة
    // ============================================================

    messageForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearNotice();

      if (sendingMessage) return;

      if (!activeConversationId) {
        showNotice("اختار محادثة أولاً.", true);
        return;
      }

      const body = messageInput.value.trim();

      if (!body) {
        showNotice("كتب الرسالة ديالك أولاً.", true);
        return;
      }

      if (body.length > 5000) {
        showNotice(
          "الرسالة طويلة بزاف. الحد الأقصى هو 5000 حرف.",
          true
        );
        return;
      }

      sendingMessage = true;

      const conversationId = activeConversationId;
      const submitButton = messageForm.querySelector(
        'button[type="submit"], button:not([type])'
      );

      const originalButtonText =
        submitButton?.textContent || "إرسال";

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "كنصيفطو...";
      }

      messageInput.disabled = true;

      try {
        // التحقق من العضوية قبل الإرسال
        const member = await isConversationMember(conversationId);

        if (!member) {
          throw new Error(
            "ما عندكش الصلاحية ترسل فهاد المحادثة."
          );
        }

        const { data, error } = await client
          .from("messages")
          .insert({
            conversation_id: conversationId,
            sender_id: currentUser.id,
            body: body
          })
          .select(
            "id, conversation_id, sender_id, body, created_at"
          )
          .single();

        if (error) throw error;

        // إذا كانت المحادثة ما زالت مفتوحة، نعرض الرسالة
        if (
          data &&
          activeConversationId === conversationId
        ) {
          const emptyState =
            chatMessages.querySelector(".empty-state");

          if (emptyState) {
            chatMessages.innerHTML = "";
          }

          renderMessage(data);
          scrollMessagesToBottom();
        }

        messageInput.value = "";
        showNotice("تصيفطات الرسالة بنجاح.");

        // تحديث وقت المحادثة فالقائمة
        const conversation = conversations.find(
          item => item.id === conversationId
        );

        if (conversation) {
          conversation.updated_at =
            data?.created_at || new Date().toISOString();

          conversations.sort(function (a, b) {
            return (
              new Date(b.updated_at || 0) -
              new Date(a.updated_at || 0)
            );
          });

          renderConversationList();
        }
      } catch (error) {
        console.error("Send message error:", error);

        showNotice(
          error.message ||
          "ما قدرناش نصيفطو الرسالة. حاول مرة أخرى.",
          true
        );
      } finally {
        sendingMessage = false;

        const canSend = Boolean(activeConversationId);
        messageInput.disabled = !canSend;

        if (submitButton) {
          submitButton.disabled = !canSend;
          submitButton.textContent = originalButtonText;
        }
      }
    });

    // ============================================================
    // بدء التطبيق
    // ============================================================

    renderEmptyMessages("اختار محادثة باش تشوف الرسائل.");

    const loadedConversations = await loadConversations();

    await openInitialConversation();

    // ============================================================
    // تنظيف Realtime عند مغادرة الصفحة
    // ============================================================

    window.addEventListener("pagehide", function () {
      pageDestroyed = true;

      if (realtimeChannel) {
        client.removeChannel(realtimeChannel);
        realtimeChannel = null;
      }
    });
  });
})();
