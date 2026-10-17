const products = [
  {
    id: 1,
    kind: "Bars",
    name: "Sea Salt Dark",
    price: 390,
    weight: "80 g",
    cacao: "70% cacao",
    note: "A little salty, deeply lovely",
    tag: "BESTSELLER",
    image: "photo-1511381939415-e44015466834",
  },
  {
    id: 2,
    kind: "Bars",
    name: "Creamy Classic",
    price: 320,
    weight: "80 g",
    cacao: "Milk chocolate",
    note: "Silky, smooth and sweet",
    tag: "JUST IN",
    image: "photo-1606313564200-e75d5e30476c",
  },
  {
    id: 3,
    kind: "Bars",
    name: "Orange Grove",
    price: 420,
    weight: "80 g",
    cacao: "68% cacao",
    note: "Dark chocolate and orange",
    tag: "",
    image: "photo-1511381939415-e44015466834",
  },
  {
    id: 4,
    kind: "Bars",
    name: "Hazelnut Hug",
    price: 450,
    weight: "80 g",
    cacao: "Milk chocolate",
    note: "With roasted hazelnuts",
    tag: "FAN FAVOURITE",
    image: "photo-1481391319762-47dff72954d9",
  },
  {
    id: 5,
    kind: "Bars",
    name: "After Dinner",
    price: 520,
    weight: "80 g",
    cacao: "85% cacao",
    note: "Bold, mellow, not too sweet",
    tag: "",
    image: "photo-1606313564200-e75d5e30476c",
  },
  {
    id: 6,
    kind: "Bars",
    name: "Honeycomb Crunch",
    price: 390,
    weight: "80 g",
    cacao: "Milk chocolate",
    note: "Golden honeycomb pieces",
    tag: "",
    image: "photo-1548907040-4d42baa9a0a7",
  },
  {
    id: 7,
    kind: "Gifts",
    name: "Little Luxuries",
    price: 1290,
    weight: "12 pieces",
    cacao: "Assorted truffles",
    note: "A box made for sharing",
    tag: "GIFT READY",
    image: "photo-1481391319762-47dff72954d9",
  },
  {
    id: 8,
    kind: "Gifts",
    name: "The Sharing Box",
    price: 1590,
    weight: "20 pieces",
    cacao: "Bars and bonbons",
    note: "A little something for everyone",
    tag: "BESTSELLER",
    image: "photo-1511381939415-e44015466834",
  },
];
const money = (n) => "₹" + n.toLocaleString("en-IN");
let activeFilter = "Bars",
  lowFirst = false,
  cart = JSON.parse(localStorage.getItem("coco-cart") || "{}"),
  favorites = new Set(
    JSON.parse(localStorage.getItem("coco-favorites") || "[]"),
  );
const grid = document.querySelector("#product-grid"),
  drawer = document.querySelector("#cart-drawer"),
  overlay = document.querySelector("#overlay"),
  dialog = document.querySelector("#checkout-dialog"),
  buyDialog = document.querySelector("#buy-dialog"),
  loginRequiredDialog = document.querySelector("#login-required-dialog");
let pendingProductId = null;
function renderProducts() {
  const list = products.filter((p) => p.kind === activeFilter);
  if (lowFirst) list.sort((a, b) => a.price - b.price);
  grid.innerHTML = list
    .map(
      (p) =>
        `<article class="product-card"><div class="product-art"><img loading="lazy" src="https://images.unsplash.com/${p.image}?auto=format&fit=crop&w=600&q=80" alt="${p.name} chocolate"><span class="product-brand">Coco &amp; Co.</span><strong class="product-name">${p.name}</strong><button class="favorite-toggle ${favorites.has(p.id) ? "favorited" : ""}" data-favorite="${p.id}" aria-label="Save ${p.name}">${favorites.has(p.id) ? "♥" : "♡"}</button></div><div class="product-details"><div class="product-kicker">${p.tag || "SMALL BATCH CHOCOLATE"}</div><div class="product-price-row"><span>PRICE</span><strong class="price">${money(p.price)}</strong></div><div class="detail-row"><span>Cocoa</span><strong>${p.cacao}</strong></div><div class="detail-row"><span>Pack size</span><strong>${p.weight}</strong></div><div class="detail-row"><span>Tasting notes</span><strong>${p.note}</strong></div><button class="add-button" data-add="${p.id}">Buy now <span aria-hidden="true">→</span></button></div></article>`,
    )
    .join("");
  document.querySelector("#collection-title").textContent =
    activeFilter === "Bars"
      ? "A little bar for every mood"
      : "VIP chocolate selection";
}
function entries() {
  return Object.entries(cart)
    .filter(([, q]) => q > 0)
    .map(([id, q]) => ({
      product: products.find((p) => p.id === Number(id)),
      qty: q,
    }))
    .filter((x) => x.product);
}
function saveCart() {
  localStorage.setItem("coco-cart", JSON.stringify(cart));
  renderCart();
}
function renderCart() {
  const items = entries(),
    count = items.reduce((a, x) => a + x.qty, 0),
    subtotal = items.reduce((a, x) => a + x.product.price * x.qty, 0);
  document.querySelector("#drawer-count").textContent = `(${count})`;
  document.querySelector("#subtotal").textContent = money(subtotal);
  document.querySelector("#cart-items").innerHTML = items
    .map(
      ({ product: p, qty }) =>
        `<div class="cart-row"><img src="https://images.unsplash.com/${p.image}?auto=format&fit=crop&w=180&q=75" alt="${p.name}"><div><h3>${p.name}</h3><small>${p.cacao} · ${p.weight}</small><div class="qty-controls"><button data-qty="${p.id}" data-change="-1" aria-label="Remove one">−</button><span>${qty}</span><button data-qty="${p.id}" data-change="1" aria-label="Add one">+</button></div></div><div><strong>${money(p.price * qty)}</strong><button class="remove-item" data-remove="${p.id}">Remove</button></div></div>`,
    )
    .join("");
  document.querySelector("#cart-empty").style.display = count ? "none" : "grid";
  document.querySelector("#drawer-foot").style.display = count
    ? "block"
    : "none";
}
function cartOpen(open) {
  drawer.classList.toggle("open", open);
  overlay.classList.toggle("open", open);
  drawer.setAttribute("aria-hidden", String(!open));
  document.body.style.overflow = open ? "hidden" : "";
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
  const add = e.target.closest("[data-add]");
  if (add) {
    pendingProductId = Number(add.dataset.add);
    const product = products.find((p) => p.id === pendingProductId);
    document.querySelector("#buy-dialog-product").textContent = product.name;
    document.querySelector("#buy-dialog-price").textContent = money(
      product.price,
    );
    document.querySelector("#buy-dialog-pack").textContent = product.weight;
    buyDialog.showModal();
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
document.querySelector("#cart-items").addEventListener("click", (e) => {
  const q = e.target.closest("[data-qty]"),
    r = e.target.closest("[data-remove]");
  if (q) {
    const id = q.dataset.qty;
    cart[id] = (cart[id] || 0) + Number(q.dataset.change);
    if (cart[id] <= 0) delete cart[id];
    saveCart();
  }
  if (r) {
    delete cart[r.dataset.remove];
    saveCart();
  }
});
document
  .querySelector("#close-cart")
  .addEventListener("click", () => cartOpen(false));
overlay.addEventListener("click", () => cartOpen(false));
document
  .querySelector("#continue-shopping")
  .addEventListener("click", () => cartOpen(false));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    cartOpen(false);
    if (dialog.open) dialog.close();
    if (buyDialog.open) buyDialog.close();
    if (loginRequiredDialog.open) loginRequiredDialog.close();
  }
});
document.querySelector("#buy-cancel").addEventListener("click", () => {
  buyDialog.close();
  pendingProductId = null;
});
document.querySelector("#buy-confirm").addEventListener("click", () => {
  if (!currentUser) {
    buyDialog.close();
    pendingProductId = null;
    loginRequiredDialog.showModal();
    return;
  }
  if (pendingProductId === null) return;
  cart[pendingProductId] = (cart[pendingProductId] || 0) + 1;
  saveCart();
  buyDialog.close();
  pendingProductId = null;
  cartOpen(true);
});
buyDialog.addEventListener("click", (e) => {
  if (e.target === buyDialog) {
    buyDialog.close();
    pendingProductId = null;
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
document.querySelector("#checkout").addEventListener("click", () => {
  cartOpen(false);
  document.querySelector("#order-message").textContent = "";
  document.querySelector("#checkout-form").style.display = "grid";
  dialog.showModal();
});
document
  .querySelector("#close-checkout")
  .addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) dialog.close();
});
document.querySelector("#checkout-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const code = "CC-" + Math.random().toString(36).slice(2, 7).toUpperCase();
  cart = {};
  saveCart();
  e.currentTarget.style.display = "none";
  document.querySelector("#order-message").textContent =
    `Demo order ${code} confirmed. No payment was collected.`;
});
const dashboard = document.querySelector(".dashboard"),
  rechargeScreen = document.querySelector("#recharge-screen"),
  withdrawScreen = document.querySelector("#withdraw-screen"),
  teamScreen = document.querySelector("#team-screen"),
  shareScreen = document.querySelector("#share-screen"),
  accountScreen = document.querySelector("#account-screen"),
  aboutScreen = document.querySelector("#about-screen");
let currentUser = null;
function showPage(page) {
  if (page === "account" && !currentUser) {
    location.href = "auth.html?return=%2F%23account";
    return;
  }
  dashboard.hidden = page !== "home";
  rechargeScreen.hidden = page !== "recharge";
  withdrawScreen.hidden = page !== "withdraw";
  teamScreen.hidden = page !== "team";
  shareScreen.hidden = page !== "share";
  accountScreen.hidden = page !== "account";
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
    .classList.toggle("selected", page === "account");
  window.scrollTo(0, 0);
}
function paintAccount() {
  document.querySelector("#account-display-title").textContent =
    currentUser.identifier || currentUser.email || "";
  document.querySelector("#account-user-id").textContent =
    `ID ${currentUser.member_id ?? currentUser.id.slice(0, 8).toUpperCase()}`;
  document.querySelector("#account-title").textContent = "My";
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
      inviteLink = showInviteCode(currentUser.invite_code);
      if (location.hash === "#account") showPage("account");
    }
  } catch (error) {
    console.error("Unable to load account session:", error);
    currentUser = null;
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
  .querySelector("#account-recharge")
  .addEventListener("click", () => showPage("recharge"));
document
  .querySelector("#account-withdraw")
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
  document.querySelector("#withdraw-amount").value = "0";
});
document.querySelector("#withdraw-submit").addEventListener("click", () => {
  document.querySelector("#withdraw-notice").textContent =
    "Demo only: no payout was requested or made. Your available balance remains ₹0.";
  toast("Withdrawals are unavailable in this chocolate shop demo.");
});
document.querySelector(".amount-options").addEventListener("click", (e) => {
  const b = e.target.closest("[data-amount]");
  if (!b) return;
  document.querySelector("#recharge-amount").value = b.dataset.amount;
  document
    .querySelectorAll("[data-amount]")
    .forEach((x) => x.classList.toggle("chosen", x === b));
});
document.querySelector("#recharge-submit").addEventListener("click", () => {
  document.querySelector("#recharge-notice").textContent =
    "Demo only: no payment was made and no funds were added. Your balance remains ₹0.";
  toast("No payment was made in this demo.");
});
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
renderCart();
loadSession();
