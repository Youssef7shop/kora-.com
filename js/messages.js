
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", async function () {
    const client = window.novaClient;

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
      console.error("NOVA MARKET: عناصر المحادثات ناقصة في messages.html.");
      return;
    }

    let currentUser = null;
    let conversations = [];
    let activeConversationId = null;
    let realtimeChannel = null;
    let loadingMessages = false;
    let sendingMessage = false;

    const renderedMessageIds = new Set();

    // ==================================================
    // أدوات مساعدة
    // ==================================================

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
      } else if (window.NOVA?.toast) {
        window.NOVA.toast(message);
      } else {
        alert(message);
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

    function getConversationId(value) {
      if (typeof value === "string") return value;

      if (value && typeof value === "object") {
        return value.id || value.conversation_id || null;
      }

      return null;
    }

    function getListingTitle(conversation) {
      const listing = conversation.listings;

      if (Array.isArray(listing)) {
        return listing[0]?.title || "محادثة NOVA MARKET";
      }

      return listing?.title || "محادثة NOVA MARKET";
    }

    function renderEmptyMessages(message) {
      chatMessages.innerHTML = `
        <div class="empty-state">
          <p>${escapeHTML(message)}</p>
        </div>
      `;
    }

    function scrollMessagesToBottom() {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // ==================================================
    // التحقق من الحساب
    // ==================================================

    if (!client) {
      showNotice(
        "Supabase ما متهيّأش. راجع js/supabase-config.js.",
        true
      );
      renderEmptyMessages("خاصك تربط قاعدة البيانات أولاً.");
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
    } catch (error) {
      console.error("Auth error:", error);
      showNotice("ما قدرناش نتحققو من الحساب ديالك.", true);
      return;
    }

    // ==================================================
    // جلب لائحة المحادثات
    // ==================================================

    async function loadConversations() {
      conversationList.innerHTML = `
        <p class="muted">كنحمّلو المحادثات...</p>
      `;

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

        conversations = (data || [])
          .map(function (row) {
            const conversation = Array.isArray(row.conversations)
              ? row.conversations[0]
              : row.conversations;

            if (!conversation) return null;

            return {
              ...conversation,
              id: conversation.id || row.conversation_id
            };
          })
          .filter(Boolean)
          .sort(function (a, b) {
            return new Date(b.updated_at || 0) -
              new Date(a.updated_at || 0);
          });

        renderConversationList();

        return conversations;
      } catch (error) {
        console.error("Load conversations error:", error);

        conversationList.innerHTML = `
          <div class="empty-state">
            <p>ما قدرناش نحمّلو المحادثات.</p>
            <p>تأكد من SQL وسياسات RLS.</p>
          </div>
        `;

        showNotice(
          "وقع مشكل فتحميل المحادثات. راجع إعدادات Supabase.",
          true
        );

        return [];
      }
    }

    // ==================================================
    // عرض المحادثات
    // ==================================================

    function renderConversationList() {
      if (!conversations.length) {
        conversationList.innerHTML = `
          <div class="empty-state">
            <h3>ما عندك حتى محادثة</h3>
            <p>دخل للسوق واختار منتج أو خدمة باش تتواصل مع البائع.</p>
          </div>
        `;
        return;
      }

      conversationList.innerHTML = conversations.map(function (item) {
        const title = getListingTitle(item);
        const isActive = item.id === activeConversationId;

        return `
          <button
            type="button"
            class="conversation-item ${isActive ? "active" : ""}"
            data-conversation-id="${escapeHTML(item.id)}"
            aria-current="${isActive ? "true" : "false"}"
          >
            <span class="conversation-avatar" aria-hidden="true">✦</span>

            <span class="conversation-info">
              <strong>${escapeHTML(title)}</strong>
              <small>${escapeHTML(formatDate(item.updated_at))}</small>
            </span>
          </button>
        `;
      }).join("");
    }

    // ==================================================
    // التأكد أن المستخدم عضو فالمحادثة
    // ==================================================

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

    // ==================================================
    // عرض رسالة
    // ==================================================

    function renderMessage(message) {
      if (!message || !message.id) return;

      // منع تكرار نفس الرسالة بعد Realtime
      if (renderedMessageIds.has(message.id)) return;

      renderedMessageIds.add(message.id);

      const isMine = message.sender_id === currentUser.id;
      const wrapper = document.createElement("div");

      wrapper.className = isMine
        ? "chat-message mine"
        : "chat-message";

      const body = document.createElement("p");
      body.className = "chat-message-body";
      body.textContent = message.body || "";

      const time = document.createElement("small");
      time.className = "chat-message-time";
      time.textContent = formatDate(message.created_at);

      wrapper.appendChild(body);
      wrapper.appendChild(time);

      chatMessages.appendChild(wrapper);

      scrollMessagesToBottom();
    }

    // ==================================================
    // تحميل الرسائل
    // ==================================================

    async function loadMessages(conversationId) {
      if (loadingMessages) return;

      loadingMessages = true;
      renderedMessageIds.clear();

      chatMessages.innerHTML = `
        <p class="muted">كنحمّلو الرسائل...</p>
      `;

      try {
        const { data, error } = await client
          .from("messages")
          .select("id, conversation_id, sender_id, body, created_at")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true });

        if (error) throw error;

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
            "تعذر تحميل الرسائل. تأكد من صلاحيات المحادثة.",
            true
          );
        }
      } finally {
        loadingMessages = false;
      }
    }

    // ==================================================
    // Realtime: استقبال الرسائل الجديدة
    // ==================================================

    function subscribeToMessages(conversationId) {
      if (realtimeChannel) {
        client.removeChannel(realtimeChannel);
        realtimeChannel = null;
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
            if (activeConversationId !== conversationId) return;

            const message = payload.new;

            if (!message || message.conversation_id !== conversationId) {
              return;
            }

            // إزالة رسالة الفراغ قبل عرض أول رسالة
            const emptyState = chatMessages.querySelector(".empty-state");
            if (emptyState) chatMessages.innerHTML = "";

            renderMessage(message);

            const conversation = conversations.find(
              item => item.id === conversationId
            );

            if (conversation) {
              conversation.updated_at = message.created_at;

              conversations.sort(function (a, b) {
                return new Date(b.updated_at || 0) -
                  new Date(a.updated_at || 0);
              });

              renderConversationList();
            }
          }
        )
        .subscribe(function (status) {
          if (status === "CHANNEL_ERROR") {
            console.error("Supabase Realtime channel error.");
          }
        });
    }

    // ==================================================
    // فتح محادثة محددة
    // ==================================================

    async function openConversation(conversationId) {
      clearNotice();

      const conversation = conversations.find(
        item => item.id === conversationId
      );

      if (!conversation) {
        showNotice("المحادثة ما لقاينهاش فحسابك.", true);
        return;
      }

      activeConversationId = conversationId;
      chatTitle.textContent = getListingTitle(conversation);

      messageInput.disabled = false;

      const sendButton = messageForm.querySelector('[type="submit"]');
      if (sendButton) sendButton.disabled = false;

      renderConversationList();
      subscribeToMessages(conversationId);

      await loadMessages(conversationId);
    }

    // ==================================================
    // الضغط على محادثة
    // ==================================================

    conversationList.addEventListener("click", async function (event) {
      const button = event.target.closest("[data-conversation-id]");
      if (!button) return;

      const conversationId = button.dataset.conversationId;

      if (!conversationId || conversationId === activeConversationId) {
        return;
      }

      await openConversation(conversationId);
    });

    // ==================================================
    // إرسال رسالة
    // ==================================================

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
        showNotice("الرسالة طويلة بزاف. الحد الأقصى هو 5000 حرف.", true);
        return;
      }

      sendingMessage = true;

      const submitButton = messageForm.querySelector('[type="submit"]');
      const originalButtonText = submitButton?.textContent || "إرسال";

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "كنصيفطو...";
      }

      messageInput.disabled = true;

      try {
        // تحقق إضافي من العضوية قبل الإرسال
        const member = await isConversationMember(activeConversationId);

        if (!member) {
          throw new Error("ما عندكش الصلاحية ترسل فهاد المحادثة.");
        }

        const conversationId = activeConversationId;

        const { error } = await client
          .from("messages")
          .insert({
            conversation_id: conversationId,
            sender_id: currentUser.id,
            body: body
          });

        if (error) throw error;

        messageInput.value = "";
        messageInput.focus();

        // Realtime كيعرض الرسالة؛ إعادة التحميل كتضمن ظهورها
        // حتى إلا كان Realtime ما خدامش.
        if (activeConversationId === conversationId) {
          await loadMessages(conversationId);
        }

        showNotice("تصيفطات الرسالة بنجاح.");
      } catch (error) {
        console.error("Send message error:", error);

        showNotice(
          error.message || "ما قدرناش نصيفطو الرسالة. حاول مرة أخرى.",
          true
        );
      } finally {
        sendingMessage = false;
        messageInput.disabled = !activeConversationId;

        if (submitButton) {
          submitButton.disabled = !activeConversationId;
          submitButton.textContent = originalButtonText;
        }
      }
    });

    // ==================================================
    // تهيئة الصفحة
    // ==================================================

    messageInput.disabled = true;

    const initialSendButton = messageForm.querySelector('[type="submit"]');
    if (initialSendButton) initialSendButton.disabled = true;

    renderEmptyMessages("اختار محادثة باش تشوف الرسائل.");

    const loadedConversations = await loadConversations();

    if (!loadedConversations.length) return;

    const params = new URLSearchParams(window.location.search);
    const requestedConversationId = params.get("conversation");

    const selectedConversation = loadedConversations.find(
      item => item.id === requestedConversationId
    );

    if (selectedConversation) {
      await openConversation(selectedConversation.id);
    } else {
      await openConversation(loadedConversations[0].id);
    }

    // تنظيف اتصال Realtime عند مغادرة الصفحة
    window.addEventListener("pagehide", function () {
      if (realtimeChannel) {
        client.removeChannel(realtimeChannel);
        realtimeChannel = null;
      }
    });
  });
})();
