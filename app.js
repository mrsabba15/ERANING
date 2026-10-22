const products = [
  { id: 1, kind: "Bars", name: "Product A", price: 550, daily: 110, days: 45, total: 24750, image: "photo-1511381939415-e44015466834" },
  { id: 2, kind: "Bars", name: "Product B", price: 1230, daily: 205, days: 45, total: 55350, image: "photo-1606313564200-e75d5e30476c" },
  { id: 3, kind: "Bars", name: "Product C", price: 3500, daily: 490, days: 20, total: 77000, image: "photo-1511381939415-e44015466834" },
  { id: 4, kind: "Bars", name: "Product D", price: 8500, daily: 1200, days: 22, total: 187000, image: "photo-1481391319762-47dff72954d9" },
  { id: 5, kind: "Bars", name: "Product E", price: 15000, daily: 1875, days: 22, total: 330000, image: "photo-1606313564200-e75d5e30476c" },
  { id: 6, kind: "Bars", name: "Product F", price: 40000, daily: 2200, days: 20, total: 800000, image: "photo-1606313564200-e75d5e30476c" },
  { id: 7, kind: "Gifts", name: "VIP 1", price: 1000, days: 1, total: 2000, image: "photo-1481391319762-47dff72954d9" },
  { id: 8, kind: "Gifts", name: "VIP 2", price: 5000, days: 1, total: 8000, image: "photo-1511381939415-e44015466834" },
  { id: 9, kind: "Gifts", name: "VIP 3", price: 8000, days: 2, total: 15000, image: "photo-1481391319762-47dff72954d9" },
  { id: 10, kind: "Gifts", name: "VIP 4", price: 20000, days: 2, total: 40000, image: "photo-1511381939415-e44015466834" },
];
const money = (n) => "₹" + n.toLocaleString("en-IN");
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}
let activeFilter = "Bars",
  lowFirst = false,
  favorites = new Set(
    JSON.parse(localStorage.getItem("coco-favorites") || "[]"),
  );
const grid = document.querySelector("#product-grid"),
  loginRequiredDialog = document.querySelector("#login-required-dialog"),
  storeAdDialog = document.querySelector("#store-ad-dialog");
function renderProducts() {
  const list = [...products];
  if (lowFirst) list.sort((a, b) => a.price - b.price);
  const bars = list.filter((p) => p.kind === "Bars");
  const vip = list.filter((p) => p.kind === "Gifts");
  const card = (p) => `<article class="plan-card ${p.kind === "Gifts" ? "vip-plan" : ""}"><div class="plan-image"><img loading="lazy" src="https://images.unsplash.com/${p.image}?auto=format&fit=crop&w=600&q=80" alt="Chocolate for ${p.name}"></div><h3>${p.name}</h3><dl><div><dt>Price</dt><dd>${money(p.price)}</dd></div>${p.daily ? `<div><dt>Daily</dt><dd>${money(p.daily)}</dd></div>` : ""}<div><dt>Days</dt><dd>${p.days}</dd></div><div class="plan-total"><dt>Total</dt><dd>${money(p.total)}</dd></div></dl><button class="add-button" type="button" data-buy="${p.id}">BUY</button></article>`;
  grid.innerHTML = `<section class="plan-group"><h2>Chocolate Bars</h2><div class="plan-group-grid">${bars.map(card).join("")}</div></section><section class="plan-group vip-group"><h2>VIP</h2><div class="plan-group-grid">${vip.map(card).join("")}</div><p class="plan-note">Withdrawal after days complete</p></section>`;
  document.querySelector("#collection-title").textContent = "Available plans";
}
const bannerSlides = [
  {
    image: "photo-1606313564200-e75d5e30476c",
    alt: "Handmade chocolate bars",
    eyebrow: "SMALL BATCH · BIG JOY",
    title: "A LITTLE<br>MORE COCOA",
    copy: "Chocolate for the good bits.",
  },
  {
    image: "photo-1511381939415-e44015466834",
    alt: "A selection of rich chocolate treats",
    eyebrow: "MADE WITH A LITTLE MAGIC",
    title: "A MOMENT<br>TO INDULGE",
    copy: "Slow down. Take the chocolate.",
  },
  {
    image: "photo-1481391319762-47dff72954d9",
    alt: "Chocolate gifts ready to share",
    eyebrow: "SWEETNESS WORTH SHARING",
    title: "GIVE A LITTLE<br>MORE JOY",
    copy: "Thoughtful treats, made by hand.",
  },
];
const bannerImage = document.querySelector(".banner>img"),
  bannerCopy = document.querySelector(".banner-copy"),
  bannerDots = document.querySelector("#banner-dots");
let activeBanner = 0,
  bannerTimer;
function showBannerSlide(index) {
  activeBanner = (index + bannerSlides.length) % bannerSlides.length;
  const slide = bannerSlides[activeBanner];
  bannerImage.style.opacity = "0";
  window.setTimeout(() => {
    bannerImage.src = `https://images.unsplash.com/${slide.image}?auto=format&fit=crop&w=1000&q=85`;
    bannerImage.alt = slide.alt;
    bannerImage.onload = () => (bannerImage.style.opacity = "1");
    bannerImage.onerror = () => (bannerImage.style.opacity = "1");
    bannerCopy.querySelector("span").textContent = slide.eyebrow;
    bannerCopy.querySelector("h1").innerHTML = slide.title;
    bannerCopy.querySelector("p").textContent = slide.copy;
  }, 160);
  bannerDots.querySelectorAll("button").forEach((button, i) => {
    const active = i === activeBanner;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", String(active));
  });
}
function restartBannerTimer() {
  window.clearInterval(bannerTimer);
  bannerTimer = window.setInterval(
    () => showBannerSlide(activeBanner + 1),
    5000,
  );
}
bannerDots.addEventListener("click", (event) => {
  const button = event.target.closest("[data-slide]");
  if (!button) return;
  showBannerSlide(Number(button.dataset.slide));
  restartBannerTimer();
});
restartBannerTimer();
let toastTimer;
function toast(message) {
  const t = document.querySelector("#toast");
  t.textContent = message;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1900);
}
document.querySelector(".tabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-filter]");
  if (!b) return;
  activeFilter = b.dataset.filter;
  document.querySelectorAll(".tab").forEach((x) => {
    const on = x === b;
    x.classList.toggle("active", on);
    x.setAttribute("aria-selected", String(on));
  });
  renderProducts();
});
document.querySelector("#sort-button").addEventListener("click", (e) => {
  lowFirst = !lowFirst;
  e.currentTarget.style.color = lowFirst ? "var(--red)" : "";
  renderProducts();
});
document.querySelector("#product-grid").addEventListener("click", (e) => {
  const buyButton = e.target.closest("[data-buy]");
  if (buyButton) {
    const product = products.find((p) => p.id === Number(buyButton.dataset.buy));
    if (!currentUser) loginRequiredDialog.showModal();
    else void beginProductPurchase(product, buyButton);
    return;
  }
  const fav = e.target.closest("[data-favorite]");
  if (fav) {
    const id = Number(fav.dataset.favorite);
    favorites.has(id) ? favorites.delete(id) : favorites.add(id);
    localStorage.setItem("coco-favorites", JSON.stringify([...favorites]));
    renderProducts();
    toast(
      favorites.has(id) ? "Saved to favourites" : "Removed from favourites",
    );
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (loginRequiredDialog.open) loginRequiredDialog.close();
  }
});
document
  .querySelector("#login-required-cancel")
  .addEventListener("click", () => loginRequiredDialog.close());
document.querySelector("#login-required-open").addEventListener("click", () => {
  loginRequiredDialog.close();
  setAuthMode("login");
  showPage("account");
});
loginRequiredDialog.addEventListener("click", (e) => {
  if (e.target === loginRequiredDialog) loginRequiredDialog.close();
});
document
  .querySelector("#store-ad-close")
  .addEventListener("click", () => storeAdDialog.close());
document.querySelector(".store-ad-link").addEventListener("click", () => {
  storeAdDialog.close();
});
storeAdDialog.addEventListener("click", (event) => {
  if (event.target === storeAdDialog) storeAdDialog.close();
});
const dashboard = document.querySelector(".dashboard"),
  rechargeScreen = document.querySelector("#recharge-screen"),
  withdrawScreen = document.querySelector("#withdraw-screen"),
  plansScreen = document.querySelector("#plans-screen"),
  teamScreen = document.querySelector("#team-screen"),
  shareScreen = document.querySelector("#share-screen"),
  accountScreen = document.querySelector("#account-screen"),
  adminScreen = document.querySelector("#admin-screen"),
  profileScreen = document.querySelector("#profile-screen"),
  transactionsScreen = document.querySelector("#transactions-screen"),
  rechargeDetailsScreen = document.querySelector("#recharge-details-screen"),
  aboutScreen = document.querySelector("#about-screen");
let currentUser = null;
let sessionReady = false;
let latestRewardBalance = 0;
let paymentConfig = { enabled: false, key_id: null, mode: "test" };
let razorpayScriptPromise = null;
function paintWalletBalance(balance) {
  const value = Number(balance);
  if (!Number.isSafeInteger(value) || value < 0) return;
  const formatted = money(value);
  document.querySelector("#wallet-balance").textContent = formatted;
  document.querySelector("#account-wallet-balance").textContent = formatted;
}
async function loadPaymentConfig() {
  const status = document.querySelector("#payment-provider-status");
  const badge = document.querySelector("#payment-mode-badge");
  const button = document.querySelector("#recharge-submit");
  const notice = document.querySelector("#recharge-notice");
  try {
    const response = await fetch("/api/payment/config", {
      credentials: "same-origin",
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Payment setup unavailable.");
    paymentConfig = result;
    if (!paymentConfig.enabled) {
      status.textContent = "Set the Razorpay keys on the server to enable checkout.";
      badge.textContent = "SETUP";
      notice.textContent = "Razorpay is not configured on the server. No payment will be taken.";
      button.disabled = true;
      return;
    }
    const live = paymentConfig.mode === "live";
    status.textContent = live
      ? "Razorpay checkout is ready. Store credit follows server confirmation."
      : "Razorpay test checkout is ready. Test mode does not collect real funds.";
    badge.textContent = live ? "LIVE" : "TEST";
    notice.textContent = live
      ? "Store credit is added only after Razorpay confirms the payment is captured."
      : "Test mode only: use Razorpay test credentials; no real funds are collected.";
    button.disabled = !sessionReady;
  } catch (error) {
    status.textContent = "Could not reach the payment backend.";
    badge.textContent = "OFFLINE";
    notice.textContent = "Payment backend is unavailable. No payment will be taken.";
    button.disabled = true;
    console.error("Unable to load Razorpay configuration:", error);
  }
}
function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve();
  if (!razorpayScriptPromise) {
    razorpayScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Could not load Razorpay Checkout."));
      document.head.append(script);
    }).catch((error) => {
      razorpayScriptPromise = null;
      throw error;
    });
  }
  return razorpayScriptPromise;
}
async function readPaymentResponse(response) {
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("The payment server returned an unreadable response.");
  }
  if (!response.ok) throw new Error(result.error || "Payment request failed.");
  return result;
}
async function waitForRecharge(orderId) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await fetch(
      `/api/recharge/status?order_id=${encodeURIComponent(orderId)}`,
      { credentials: "same-origin" },
    );
    const result = await readPaymentResponse(response);
    paintWalletBalance(result.balance_rupees);
    if (result.status === "paid") return true;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return false;
}
async function beginProductPurchase(product, button) {
  if (!product) return;
  button.disabled = true;
  let verificationStarted = false;
  try {
    const walletResponse = await fetch("/api/products/wallet-purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ product_id: product.id }),
    });
    let walletResult;
    try {
      walletResult = await walletResponse.json();
    } catch {
      throw new Error("The payment server returned an unreadable response.");
    }
    if (walletResponse.ok) {
      paintWalletBalance(walletResult.balance_rupees);
      toast(`${product.name} active plan added. Open Updates to view it.`);
      button.disabled = false;
      return;
    }
    if (
      walletResponse.status !== 402 ||
      walletResult.code !== "INSUFFICIENT_BALANCE"
    )
      throw new Error(walletResult.error || "Could not check account balance.");

    paintWalletBalance(walletResult.balance_rupees);
    if (!paymentConfig.enabled) {
      toast(
        `Insufficient balance: ${money(walletResult.balance_rupees)} available; ${money(walletResult.required_rupees)} needed.`,
      );
      button.disabled = false;
      return;
    }

    const orderResponse = await fetch("/api/products/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ product_id: product.id }),
    });
    const order = await readPaymentResponse(orderResponse);
    await loadRazorpayScript();
    const checkout = new window.Razorpay({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      name: order.name,
      description: order.description,
      order_id: order.order_id,
      theme: { color: "#6f2b2a" },
      modal: {
        ondismiss: () => {
          if (!verificationStarted) button.disabled = false;
        },
      },
      handler: async (paymentResult) => {
        verificationStarted = true;
        try {
          const verificationResponse = await fetch("/api/products/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify(paymentResult),
          });
          const verified = await readPaymentResponse(verificationResponse);
          toast(
            verified.status === "paid"
              ? `${product.name} active plan added. Open Updates to view it.`
              : "Payment is processing; order awaits server confirmation.",
          );
        } catch (error) {
          toast(error.message || "Could not verify the order payment.");
        } finally {
          button.disabled = false;
        }
      },
    });
    checkout.on("payment.failed", () => {
      toast("Payment was not completed. No order was confirmed.");
      button.disabled = false;
    });
    checkout.open();
  } catch (error) {
    toast(error.message || "Could not start product checkout.");
    button.disabled = false;
  }
}
async function beginRecharge() {
  const button = document.querySelector("#recharge-submit");
  const amountInput = document.querySelector("#recharge-amount");
  const notice = document.querySelector("#recharge-notice");
  if (!paymentConfig.enabled) {
    notice.textContent = "Razorpay is not configured on the server. No payment will be taken.";
    return;
  }
  if (!currentUser) {
    location.href = "auth.html?return=%2F%23recharge";
    return;
  }
  const amountRupees = Number(amountInput.value);
  if (!Number.isSafeInteger(amountRupees) || amountRupees < 100) {
    notice.textContent = "Enter a whole-rupee amount of at least ₹100.";
    amountInput.focus();
    return;
  }

  button.disabled = true;
  notice.textContent = "Creating a secure Razorpay order…";
  try {
    const orderResponse = await fetch("/api/recharge/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ amount_rupees: amountRupees }),
    });
    const order = await readPaymentResponse(orderResponse);
    await loadRazorpayScript();
    const checkout = new window.Razorpay({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      name: order.name,
      description: order.description,
      order_id: order.order_id,
      theme: { color: "#6f2b2a" },
      modal: {
        ondismiss: () => {
          notice.textContent = "Checkout closed. No store credit was added.";
          button.disabled = !paymentConfig.enabled;
        },
      },
      handler: async (paymentResult) => {
        notice.textContent = "Verifying payment with the server…";
        try {
          const verification = await fetch("/api/recharge/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify(paymentResult),
          });
          const verified = await readPaymentResponse(verification);
          let paid = verified.status === "paid";
          if (paid) paintWalletBalance(verified.balance_rupees);
          else paid = await waitForRecharge(order.order_id);
          if (paid) {
            notice.textContent = "Payment verified. Your store credit is updated.";
            toast("Store credit added successfully.");
          } else {
            notice.textContent = "Payment is still processing. Store credit will appear after server confirmation.";
          }
        } catch (error) {
          notice.textContent = `${error.message} If your payment was completed, refresh the page shortly to check store credit.`;
        } finally {
          button.disabled = !paymentConfig.enabled;
        }
      },
    });
    checkout.on("payment.failed", () => {
      notice.textContent = "Payment was not completed. No store credit was added.";
      button.disabled = !paymentConfig.enabled;
    });
    checkout.open();
    notice.textContent = "Checkout opened. Complete payment to update store credit.";
  } catch (error) {
    notice.textContent = error.message || "Could not start payment. Please try again.";
    button.disabled = !paymentConfig.enabled;
  }
}
function localDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
async function loadPlansData() {
  const list = document.querySelector("#active-plans-list");
  try {
    const response = await fetch("/api/plans", { credentials: "same-origin" });
    const overview = await readPaymentResponse(response);
    latestRewardBalance = overview.rewards_available_rupees || 0;
    document.querySelector("#withdraw-submit").disabled = latestRewardBalance < 1;
    document.querySelector("#withdraw-notice").textContent = latestRewardBalance > 0
      ? "Your request will appear in the admin panel for review."
      : "No earned rewards are available to withdraw yet.";
    document.querySelector("#plans-earned").textContent = money(
      overview.rewards_earned_rupees || 0,
    );
    document.querySelector("#plans-available").textContent = money(
      latestRewardBalance,
    );
    document.querySelector("#withdraw-balance").textContent = money(
      latestRewardBalance,
    );
    const amount = Number(document.querySelector("#withdraw-amount").value);
    document.querySelector("#withdraw-receive").textContent = money(
      Number.isSafeInteger(amount) && amount > 0 ? amount : 0,
    );
    list.innerHTML = overview.plans.length
      ? overview.plans
          .map((plan) => {
            const progress = Math.min(
              100,
              Math.round((plan.days_completed / plan.duration_days) * 100),
            );
            const rewardCopy =
              plan.daily_reward_rupees > 0
                ? plan.next_reward_at
                  ? `Next ${money(plan.daily_reward_rupees)} reward · ${localDate(plan.next_reward_at)}`
                  : "All daily rewards for this plan are complete"
                : "This plan has no daily reward";
            return `<article class="active-plan-card">
              <div class="active-plan-heading"><h2>${plan.product_name}</h2><span class="active-plan-status ${plan.status}">${plan.status}</span></div>
              <p class="active-plan-subtitle">Bought ${localDate(plan.purchased_at)} · ${money(plan.price_rupees)} · ${plan.payment_method === "wallet" ? "Account balance" : "Razorpay"}</p>
              <div class="active-plan-stats"><span>Daily reward<strong>${plan.daily_reward_rupees > 0 ? money(plan.daily_reward_rupees) : "—"}</strong></span><span>Rewards earned<strong>${money(plan.rewards_earned_rupees)}</strong></span><span>Days left<strong>${plan.days_remaining}</strong></span></div>
              <div class="active-plan-progress" aria-label="${progress}% complete"><span style="width:${progress}%"></span></div>
              <p class="active-plan-subtitle">${rewardCopy}</p>
            </article>`;
          })
          .join("")
      : '<p class="plans-empty">No purchased plans yet. Bought plans will appear here.</p>';
    renderWithdrawalHistory(overview.withdrawals || []);
  } catch (error) {
    list.innerHTML = `<p class="plans-empty">${error.message || "Could not load your plans."}</p>`;
  }
}
function updateWithdrawalPayoutFields() {
  const useUpi = document.querySelector("#withdraw-payout-method").value === "upi";
  document.querySelector("#withdraw-upi-fields").hidden = !useUpi;
  document.querySelector("#withdraw-bank-fields").hidden = useUpi;
  document.querySelector("#withdraw-upi-id").required = useUpi;
  document.querySelector("#withdraw-account-holder").required = !useUpi;
  document.querySelector("#withdraw-account-number").required = !useUpi;
  document.querySelector("#withdraw-ifsc").required = !useUpi;
}
function renderWithdrawalHistory(withdrawals) {
  const history = document.querySelector("#withdrawal-history");
  if (!history) return;
  history.innerHTML = `<div class="withdrawal-history-heading">Recent requests</div>${
    withdrawals.length
      ? withdrawals
          .map(
            (request) => {
              const safeStatus = ["pending", "accepted", "paid", "rejected"].includes(request.status)
                ? request.status
                : "pending";
              return `<article class="withdrawal-history-card">
                <div class="active-plan-heading"><strong>${money(request.amount_rupees)}</strong><span class="withdrawal-status ${safeStatus}">${safeStatus}</span></div>
                <small>Requested ${localDate(request.created_at)} · Ref ${request.id.slice(0, 8).toUpperCase()}</small>
              </article>`;
            },
          )
          .join("")
      : '<p class="withdrawal-empty">No withdrawal requests yet.</p>'
  }`;
}
async function requestWithdrawal() {
  const button = document.querySelector("#withdraw-submit");
  const notice = document.querySelector("#withdraw-notice");
  const amountRupees = Number(document.querySelector("#withdraw-amount").value);
  const payoutMethod = document.querySelector("#withdraw-payout-method").value;
  if (!Number.isSafeInteger(amountRupees) || amountRupees < 1) {
    notice.textContent = "Enter a whole-rupee amount of at least ₹1.";
    return;
  }
  let payoutDetails;
  if (payoutMethod === "upi") {
    const upiId = document.querySelector("#withdraw-upi-id").value.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,99}@[A-Za-z][A-Za-z0-9.-]{1,30}$/.test(upiId)) {
      notice.textContent = "Enter a valid UPI ID, such as name@bank.";
      return;
    }
    payoutDetails = { payout_method: "upi", upi_id: upiId };
  } else {
    const accountHolder = document.querySelector("#withdraw-account-holder").value.trim();
    const accountNumber = document.querySelector("#withdraw-account-number").value.trim();
    const ifsc = document.querySelector("#withdraw-ifsc").value.trim().toUpperCase();
    if (accountHolder.length < 2 || accountHolder.length > 100) {
      notice.textContent = "Enter the bank account holder name.";
      return;
    }
    if (!/^\d{8,20}$/.test(accountNumber)) {
      notice.textContent = "Enter a valid bank account number (8–20 digits).";
      return;
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
      notice.textContent = "Enter a valid 11-character IFSC code.";
      return;
    }
    payoutDetails = {
      payout_method: "bank",
      account_holder_name: accountHolder,
      account_number: accountNumber,
      ifsc_code: ifsc,
    };
  }
  button.disabled = true;
  notice.textContent = "Submitting your withdrawal request…";
  try {
    const response = await fetch("/api/withdrawals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ amount_rupees: amountRupees, ...payoutDetails }),
    });
    const result = await readPaymentResponse(response);
    document.querySelector("#withdraw-amount").value = "";
    document.querySelector("#withdraw-upi-id").value = "";
    document.querySelector("#withdraw-account-holder").value = "";
    document.querySelector("#withdraw-account-number").value = "";
    document.querySelector("#withdraw-ifsc").value = "";
    notice.textContent = `Your ${money(result.amount_rupees)} withdrawal request was sent to the admin for review.`;
    toast("Withdrawal request sent.");
  } catch (error) {
    notice.textContent = error.message || "Could not submit the request.";
  } finally {
    await loadPlansData();
  }
}
async function loadAdminWithdrawals() {
  const list = document.querySelector("#admin-withdrawal-list");
  const notice = document.querySelector("#admin-withdrawal-notice");
  if (!list || !notice) return;
  notice.textContent = "Loading withdrawal requests…";
  try {
    const response = await fetch("/api/admin/withdrawals", { credentials: "same-origin" });
    const result = await readPaymentResponse(response);
    const requests = result.requests || [];
    const pendingCount = requests.filter((request) => request.status === "pending").length;
    notice.textContent = `${pendingCount} request${pendingCount === 1 ? "" : "s"} awaiting review.`;
    list.innerHTML = requests.length
      ? requests.map((request) => {
          const safeStatus = ["pending", "accepted", "paid", "rejected"].includes(request.status)
            ? request.status
            : "pending";
          const actions = safeStatus === "pending"
            ? `<div class="admin-withdrawal-actions"><button type="button" data-admin-action="accept" data-request-id="${escapeHtml(request.id)}">Accept</button><button type="button" data-admin-action="reject" data-request-id="${escapeHtml(request.id)}">Reject</button></div>`
            : "";
          const member = request.member_id == null ? "—" : escapeHtml(request.member_id);
          const payoutDetails = request.payout_method === "upi" && request.upi_id
            ? `<small class="admin-payout-detail">UPI ID: ${escapeHtml(request.upi_id)}</small>`
            : request.payout_method === "bank" && request.account_number
              ? `<small class="admin-payout-detail">Bank: ${escapeHtml(request.account_holder_name)} · A/c ${escapeHtml(request.account_number)} · IFSC ${escapeHtml(request.ifsc_code)}</small>`
              : '<small class="admin-payout-detail">Payout details were not recorded for this request.</small>';
          return `<article class="admin-withdrawal-card">
            <div class="active-plan-heading"><strong>${money(request.amount_rupees)}</strong><span class="withdrawal-status ${safeStatus}">${safeStatus}</span></div>
            <small>${escapeHtml(request.email)} · Member ${member}</small>
            <small>Requested ${localDate(request.created_at)} · Ref ${escapeHtml(String(request.id).slice(0, 8).toUpperCase())}</small>
            ${payoutDetails}
            ${actions}
          </article>`;
        }).join("")
      : '<p class="withdrawal-empty">No withdrawal requests yet.</p>';
  } catch (error) {
    notice.textContent = error.message || "Could not load withdrawal requests.";
    list.innerHTML = "";
  }
}
async function reviewWithdrawal(event) {
  const button = event.target.closest("[data-admin-action]");
  if (!button) return;
  button.disabled = true;
  try {
    const response = await fetch(`/api/admin/withdrawals/${encodeURIComponent(button.dataset.requestId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: button.dataset.adminAction }),
    });
    const result = await readPaymentResponse(response);
    toast(result.status === "accepted" ? "Withdrawal accepted." : "Withdrawal rejected.");
    await Promise.all([loadAdminWithdrawals(), loadPlansData()]);
  } catch (error) {
    button.disabled = false;
    toast(error.message || "Could not update withdrawal request.");
  }
}
function showPage(page) {
  if (["account", "plans", "withdraw", "admin", "profile", "transactions", "recharge-details"].includes(page) && !currentUser) {
    const returnPage = ["plans", "withdraw", "admin", "profile", "transactions", "recharge-details"].includes(page) ? page : "account";
    location.href = `auth.html?return=%2F%23${returnPage}`;
    return;
  }
  if (page === "admin" && !currentUser.is_admin) {
    toast("Admin access is not enabled for this account.");
    page = "account";
  }
  dashboard.hidden = page !== "home";
  rechargeScreen.hidden = page !== "recharge";
  withdrawScreen.hidden = page !== "withdraw";
  plansScreen.hidden = page !== "plans";
  teamScreen.hidden = page !== "team";
  shareScreen.hidden = page !== "share";
  accountScreen.hidden = page !== "account";
  adminScreen.hidden = page !== "admin";
  profileScreen.hidden = page !== "profile";
  transactionsScreen.hidden = page !== "transactions";
  rechargeDetailsScreen.hidden = page !== "recharge-details";
  aboutScreen.hidden = page !== "about";
  document
    .querySelector("#home-shortcut")
    .classList.toggle("selected", page === "home");
  document
    .querySelector("#team-shortcut")
    .classList.toggle("selected", page === "team");
  document
    .querySelector("#share-shortcut")
    .classList.toggle("selected", page === "share");
  document
    .querySelector("#my-shortcut")
    .classList.toggle("selected", ["account", "profile", "about", "admin", "transactions", "recharge-details"].includes(page));
  window.scrollTo(0, 0);
  if (page === "plans" || page === "withdraw") void loadPlansData();
  if (page === "admin") void loadAdminWithdrawals();
  if (page === "transactions") void loadAccountTransactions();
  if (page === "recharge-details") void loadRechargeDetails();
  if (page === "home") showStoreAd();
  else if (storeAdDialog.open) storeAdDialog.close();
}
function showStoreAd() {
  if (!storeAdDialog.open) storeAdDialog.showModal();
}
function paintAccount() {
  document.querySelector("#account-display-title").textContent =
    currentUser.identifier || currentUser.email || "";
  document.querySelector("#account-user-id").textContent =
    `ID ${currentUser.member_id ?? currentUser.id.slice(0, 8).toUpperCase()}`;
  document.querySelector("#account-title").textContent = "My";
}
function paintProfileInfo() {
  if (!currentUser) return;
  document.querySelector("#profile-login-id").textContent =
    currentUser.identifier || currentUser.email || "—";
  document.querySelector("#profile-member-id").textContent =
    currentUser.member_id ?? currentUser.id.slice(0, 8).toUpperCase();
  document.querySelector("#profile-invite-code").textContent =
    currentUser.invite_code || "—";
  document.querySelector("#profile-joined-date").textContent =
    currentUser.created_at ? localDate(currentUser.created_at) : "—";
}
const transactionTypes = {
  plan_purchase: "Plan purchase",
  recharge: "Recharge",
  withdrawal: "Withdrawal request",
};
const transactionStatuses = {
  paid: "Paid",
  accepted: "Accepted",
  pending: "Pending",
  rejected: "Rejected",
};
function renderHistoryCard(entry, { recharge = false } = {}) {
  const status = transactionStatuses[entry.status] ? entry.status : "pending";
  const title = escapeHtml(entry.title || (recharge ? "Store credit recharge" : "Transaction"));
  const detail = recharge
    ? "Razorpay"
    : `${transactionTypes[entry.type] || "Transaction"} · ${entry.method || "—"}`;
  return `<article class="account-history-card">
    <div class="account-history-card-heading"><div><strong>${title}</strong><small>${escapeHtml(detail)}</small></div>
      <span class="withdrawal-status ${status}">${transactionStatuses[status]}</span></div>
    <div class="account-history-card-footer"><time>${escapeHtml(localDate(entry.created_at))}</time>
      <strong>${money(Number(entry.amount_rupees) || 0)}</strong></div>
  </article>`;
}
async function loadAccountTransactions() {
  const list = document.querySelector("#transactions-list");
  list.innerHTML = '<p class="account-history-empty">Loading transactions…</p>';
  try {
    const response = await fetch("/api/account/transactions", { credentials: "same-origin" });
    const result = await readPaymentResponse(response);
    list.innerHTML = result.transactions?.length
      ? result.transactions.map((entry) => renderHistoryCard(entry)).join("")
      : '<p class="account-history-empty">No transactions yet.</p>';
  } catch (error) {
    list.innerHTML = `<p class="account-history-empty">${escapeHtml(error.message || "Could not load transactions.")}</p>`;
  }
}
async function loadRechargeDetails() {
  const list = document.querySelector("#recharges-list");
  const balance = document.querySelector("#recharge-details-balance");
  list.innerHTML = '<p class="account-history-empty">Loading recharge details…</p>';
  try {
    const response = await fetch("/api/account/recharges", { credentials: "same-origin" });
    const result = await readPaymentResponse(response);
    balance.textContent = money(Number(result.balance_rupees) || 0);
    list.innerHTML = result.recharges?.length
      ? result.recharges.map((entry) => renderHistoryCard(entry, { recharge: true })).join("")
      : '<p class="account-history-empty">No confirmed recharges yet.</p>';
  } catch (error) {
    list.innerHTML = `<p class="account-history-empty">${escapeHtml(error.message || "Could not load recharge details.")}</p>`;
  }
}
function showInviteCode(code) {
  document.querySelector("#invite-code-value").textContent = code;
  const url = new URL("/", location.origin);
  url.searchParams.set("inviteCode", code);
  url.hash = "catalog";
  document.querySelector("#share-link-text").textContent = url.toString();
  return url.toString();
}
function createInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
    bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `COCO-${[...bytes].map((n) => alphabet[n % alphabet.length]).join("")}`;
}
const browserInviteCode =
  localStorage.getItem("coco-invite-code") || createInviteCode();
localStorage.setItem("coco-invite-code", browserInviteCode);
let inviteLink = showInviteCode(browserInviteCode);
async function loadSession() {
  try {
    const response = await fetch("/api/session", {
      credentials: "same-origin",
    });
    if (!response.ok)
      throw new Error("Could not load the current account session.");
    const data = await response.json();
    currentUser = data.user;
    if (currentUser) {
      paintAccount();
      paintProfileInfo();
      paintWalletBalance(currentUser.wallet_balance_rupees || 0);
      inviteLink = showInviteCode(currentUser.invite_code);
      document.querySelector("#account-admin").hidden = !currentUser.is_admin;
      if (location.hash === "#account") showPage("account");
      else if (location.hash === "#recharge") showPage("recharge");
      else if (location.hash === "#plans") showPage("plans");
      else if (location.hash === "#withdraw") showPage("withdraw");
      else if (location.hash === "#admin") showPage("admin");
      else if (location.hash === "#profile") showPage("profile");
      else if (location.hash === "#transactions") showPage("transactions");
      else if (location.hash === "#recharge-details") showPage("recharge-details");
    }
  } catch (error) {
    console.error("Unable to load account session:", error);
    currentUser = null;
  } finally {
    sessionReady = true;
    if (paymentConfig.enabled)
      document.querySelector("#recharge-submit").disabled = false;
  }
}
async function copyText(value, message) {
  try {
    await navigator.clipboard.writeText(value);
    toast(message);
  } catch {
    toast("Clipboard access is unavailable in this preview");
  }
}
async function shareChocolatePicks() {
  if (navigator.share) {
    try {
      await navigator.share({
        title: "Coco & Co. Chocolate",
        text: "A little chocolate is better shared. Take a look at these chocolate picks.",
        url: inviteLink,
      });
    } catch (error) {
      if (error.name !== "AbortError")
        toast("Sharing is unavailable right now");
    }
  } else copyText(inviteLink, "Chocolate invite link copied");
}

document
  .querySelector("#home-shortcut")
  .addEventListener("click", () => showPage("home"));
document
  .querySelector("#team-shortcut")
  .addEventListener("click", () => showPage("team"));
document
  .querySelector("#share-shortcut")
  .addEventListener("click", () => showPage("share"));
document
  .querySelector("#my-shortcut")
  .addEventListener("click", () => showPage("account"));
document
  .querySelector("#recharge-shortcut")
  .addEventListener("click", () => showPage("recharge"));
document
  .querySelector("#withdrawal-shortcut")
  .addEventListener("click", () => showPage("withdraw"));
document
  .querySelector("#plans-shortcut")
  .addEventListener("click", () => showPage("plans"));
document
  .querySelector("#back-from-plans")
  .addEventListener("click", () => showPage("home"));
document
  .querySelector("#plans-withdraw")
  .addEventListener("click", () => showPage("withdraw"));
document
  .querySelector("#account-recharge")
  .addEventListener("click", () => showPage("recharge"));
document
  .querySelector("#account-withdraw")
  .addEventListener("click", () => showPage("withdraw"));
document
  .querySelector("#account-withdrawal-details")
  .addEventListener("click", () => showPage("withdraw"));
document
  .querySelector("#back-to-store")
  .addEventListener("click", () => showPage("home"));
document
  .querySelector("#back-from-withdraw")
  .addEventListener("click", () => showPage("home"));
document.querySelector("#team-shop-button").addEventListener("click", () => {
  showPage("home");
  document.querySelector("#catalog").scrollIntoView({ behavior: "smooth" });
});
document.querySelector(".team-levels").addEventListener("click", (e) => {
  const b = e.target.closest("[data-level]");
  if (!b) return;
  document.querySelectorAll(".team-level").forEach((x) => {
    const on = x === b;
    x.classList.toggle("active", on);
    x.setAttribute("aria-selected", String(on));
  });
  document.querySelector("#team-level-heading").textContent =
    `LEVEL ${b.dataset.level} MEMBERS`;
});
document.querySelector(".account-screen").addEventListener("click", (e) => {
  const row = e.target.closest("[data-account-action]");
  if (!row) return;
  if (row.querySelector("span")?.textContent.trim() === "About us") {
    showPage("about");
    return;
  }
  toast(row.dataset.accountAction);
});
document.querySelector("#account-personal-info").addEventListener("click", () => {
  paintProfileInfo();
  showPage("profile");
});
document.querySelector("#account-admin").addEventListener("click", () => showPage("admin"));
document.querySelector("#admin-withdrawal-list").addEventListener("click", reviewWithdrawal);
document.querySelector("#back-from-admin").addEventListener("click", () => showPage("account"));
document.querySelector("#back-from-profile").addEventListener("click", () => showPage("account"));
document.querySelector("#account-transactions").addEventListener("click", () => showPage("transactions"));
document.querySelector("#account-recharge-details").addEventListener("click", () => showPage("recharge-details"));
document.querySelector("#back-from-transactions").addEventListener("click", () => showPage("account"));
document.querySelector("#back-from-recharge-details").addEventListener("click", () => showPage("account"));
document
  .querySelector("#back-from-about")
  .addEventListener("click", () => showPage("account"));
document
  .querySelector("#copy-share-code")
  .addEventListener("click", () =>
    copyText(
      currentUser?.invite_code || browserInviteCode,
      "Invite code copied",
    ),
  );
document
  .querySelector("#copy-share-link")
  .addEventListener("click", () =>
    copyText(inviteLink, "Chocolate invite link copied"),
  );
document
  .querySelector("#copy-option")
  .addEventListener("click", () =>
    copyText(inviteLink, "Chocolate invite link copied"),
  );
document
  .querySelector("#share-main-button")
  .addEventListener("click", shareChocolatePicks);
document
  .querySelector("#share-option")
  .addEventListener("click", shareChocolatePicks);
document.querySelector("#browse-option").addEventListener("click", () => {
  showPage("home");
  document.querySelector("#catalog").scrollIntoView({ behavior: "smooth" });
});
document.querySelector("#withdraw-max").addEventListener("click", () => {
  document.querySelector("#withdraw-amount").value = String(latestRewardBalance);
  document.querySelector("#withdraw-receive").textContent = money(latestRewardBalance);
});
document
  .querySelector("#withdraw-amount")
  .addEventListener("input", (event) => {
    const amount = Number(event.currentTarget.value);
    document.querySelector("#withdraw-receive").textContent = money(
      Number.isSafeInteger(amount) && amount > 0 ? amount : 0,
    );
  });
document.querySelector("#withdraw-submit").addEventListener("click", requestWithdrawal);
document.querySelector("#withdraw-payout-method").addEventListener("change", updateWithdrawalPayoutFields);
updateWithdrawalPayoutFields();
document.querySelector(".amount-options").addEventListener("click", (e) => {
  const b = e.target.closest("[data-amount]");
  if (!b) return;
  document.querySelector("#recharge-amount").value = b.dataset.amount;
  document
    .querySelectorAll("[data-amount]")
    .forEach((x) => x.classList.toggle("chosen", x === b));
});
document.querySelector("#recharge-submit").addEventListener("click", beginRecharge);
document.querySelector("#newsletter-form").addEventListener("submit", (e) => {
  e.preventDefault();
  toast("Thanks for joining Coco Notes");
  e.currentTarget.reset();
});
document
  .querySelector("#account-logout")
  .addEventListener("click", async () => {
    try {
      const response = await fetch("/api/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("Could not sign out.");
      location.href = "auth.html?return=%2F%23account";
    } catch (error) {
      toast(error.message);
    }
  });
renderProducts();
if (!["#account", "#recharge", "#plans", "#withdraw", "#admin", "#profile", "#transactions", "#recharge-details"].includes(location.hash))
  showStoreAd();
loadSession();
loadPaymentConfig();
