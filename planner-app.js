// Category config
var CATS = {
  "Swimming":      { color: "#2563EB", bg: "#EFF6FF" },
  "Dance":         { color: "#7C3AED", bg: "#F5F3FF" },
  "Gymnastics":    { color: "#0D9488", bg: "#F0FDFA" },
  "Martial Arts":  { color: "#B45309", bg: "#FFFBEB" },
  "Arts & Crafts": { color: "#BE185D", bg: "#FFF1F2" },
  "Skating":       { color: "#0369A1", bg: "#F0F9FF" },
  "Sports":        { color: "#15803D", bg: "#F0FDF4" },
  "Other":         { color: "#525252", bg: "#F5F5F5" }
};

var state = {
  search: "",
  day: "all",
  time: "all",
  cg: "all",
  cats: new Set(Object.keys(CATS)),
  price: "all",
  sort: "name",
  page: 1,
  pageSize: 50,
  plan: JSON.parse(localStorage.getItem("spring26_plan") || "[]")
};

function parseHour(s) {
  var parts = s.trim().split(" ");
  var time = parts[0];
  var ampm = parts[1];
  var nums = time.split(":");
  var h = parseInt(nums[0], 10);
  var m = parseInt(nums[1] || "0", 10);
  var hr = h + m / 60;
  if (ampm === "PM" && h !== 12) hr += 12;
  if (ampm === "AM" && h === 12) hr -= 12;
  return hr;
}

function parseTimeRange(t) {
  if (!t || t.indexOf("-") === -1) return { start: 0, end: 24 };
  var parts = t.split(" - ");
  return { start: parseHour(parts[0]), end: parseHour(parts[1]) };
}

function timeCategory(t) {
  var s = parseTimeRange(t).start;
  if (s < 12) return "morning";
  if (s < 16) return "afternoon";
  return "evening";
}

function parsePrice(p) {
  if (!p) return null;
  var m = p.match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}

function formatSpots(n) {
  if (n === null || n === undefined) return "";
  if (n === 0) return '<span class="spots spots-none">Full</span>';
  if (n <= 3) return '<span class="spots spots-low">' + n + " spot" + (n === 1 ? "" : "s") + " left</span>";
  return '<span class="spots spots-ok">' + n + " open</span>";
}

function hasConflict(a1, a2) {
  if (a1.day !== a2.day || !a1.t || !a2.t) return false;
  var t1 = parseTimeRange(a1.t);
  var t2 = parseTimeRange(a2.t);
  return t1.start < t2.end && t2.start < t1.end;
}

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function getFiltered() {
  var q = state.search.toLowerCase().trim();
  return DATA.filter(function(a) {
    if (!state.cats.has(a.cat)) return false;
    if (state.day !== "all" && a.day !== state.day) return false;
    if (state.time !== "all" && timeCategory(a.t) !== state.time) return false;
    if (state.cg === "yes" && !a.cg) return false;
    if (state.cg === "no" && a.cg) return false;
    if (state.price === "free") { var p = parsePrice(a.price); if (p !== 0 && a.price) return false; }
    if (state.price === "under60") { var p = parsePrice(a.price); if (p === null || p >= 60) return false; }
    if (state.price === "60to100") { var p = parsePrice(a.price); if (p === null || p < 60 || p > 100) return false; }
    if (state.price === "over100") { var p = parsePrice(a.price); if (p === null || p <= 100) return false; }
    if (q) {
      var haystack = (a.n + " " + a.loc + " " + a.rn + " " + a.dr).toLowerCase();
      if (haystack.indexOf(q) === -1) return false;
    }
    return true;
  });
}

function getSorted(arr) {
  return arr.slice().sort(function(a, b) {
    switch (state.sort) {
      case "date": return (a.ds || "").localeCompare(b.ds || "");
      case "time": return parseTimeRange(a.t).start - parseTimeRange(b.t).start;
      case "price":
        var pa = parsePrice(a.price), pb = parsePrice(b.price);
        if (pa === null && pb === null) return 0;
        if (pa === null) return 1;
        if (pb === null) return -1;
        return pa - pb;
      default: return a.n.localeCompare(b.n);
    }
  });
}

var SVG_PIN = '<svg class="meta-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
var SVG_CAL = '<svg class="meta-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
var SVG_CLK = '<svg class="meta-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

function renderCard(a, inPlan) {
  var cat = CATS[a.cat] || CATS["Other"];
  var badge = '<span class="cat-badge" style="background:' + cat.bg + ";color:" + cat.color + '">' + esc(a.cat) + "</span>";
  var cgBadge = a.cg ? '<span class="cg-badge">+ Caregiver</span>' : "";

  var priceHtml;
  if (a.purl) {
    priceHtml = '<a href="' + esc(a.purl) + '" target="_blank" class="price-link">View fees &#8599;</a>';
  } else if (a.price) {
    priceHtml = '<span class="price-tag">' + esc(a.price) + "</span>";
  } else {
    priceHtml = '<span class="price-tag" style="color:var(--success)">Free</span>';
  }

  var addBtn;
  if (inPlan) {
    addBtn = '<button class="btn-add added" disabled>&#10003; Added</button>';
  } else {
    addBtn = '<button class="btn-add" onclick="addToPlan(' + a.id + ')">+ Add</button>';
  }

  return '<div class="card' + (inPlan ? " in-plan" : "") + '" id="card-' + a.id + '">' +
    '<div class="card-top">' + badge + cgBadge + '<span class="card-name">' + esc(a.n) + "</span></div>" +
    '<div class="card-meta">' +
      '<span class="meta-item">' + SVG_PIN + '<span class="meta-strong">' + esc(a.loc) + "</span></span>" +
      '<span class="meta-item">' + SVG_CAL + esc(a.dr) + "</span>" +
      '<span class="meta-item">' + SVG_CLK + '<span class="meta-strong">' + esc(a.day) + "</span> &middot; " + esc(a.t) + "</span>" +
    "</div>" +
    '<div class="card-bottom">' + priceHtml + formatSpots(a.spots) + '<span class="reg-num">#' + esc(a.rn) + "</span></div>" +
    '<div class="card-action">' + addBtn + "</div>" +
  "</div>";
}

function renderActivities() {
  var filtered = getSorted(getFiltered());
  var total = filtered.length;
  var pages = Math.ceil(total / state.pageSize);
  if (state.page > pages) state.page = Math.max(1, pages);
  var start = (state.page - 1) * state.pageSize;
  var slice = filtered.slice(start, start + state.pageSize);
  var planIds = {};
  state.plan.forEach(function(p) { planIds[p.id] = true; });

  document.getElementById("result-count").innerHTML = "<strong>" + total.toLocaleString() + "</strong> activities";

  var listEl = document.getElementById("activity-list");
  if (total === 0) {
    listEl.innerHTML = '<div class="no-results"><p>No activities match your filters.</p></div>';
  } else {
    var html = "";
    for (var i = 0; i < slice.length; i++) {
      html += renderCard(slice[i], !!planIds[slice[i].id]);
    }
    listEl.innerHTML = html;
  }

  renderPagination(total, pages);
  updateCatCounts(filtered);
}

function renderPagination(total, pages) {
  var el = document.getElementById("pagination");
  if (pages <= 1) { el.innerHTML = ""; return; }

  var p = state.page;
  var nums = [1];
  if (p > 3) nums.push("...");
  for (var i = Math.max(2, p - 1); i <= Math.min(pages - 1, p + 1); i++) nums.push(i);
  if (p < pages - 2) nums.push("...");
  if (pages > 1) nums.push(pages);

  var html = '<button class="btn-page" ' + (p === 1 ? "disabled" : "") + ' onclick="goPage(' + (p - 1) + ')">&larr; Prev</button>';
  for (var i = 0; i < nums.length; i++) {
    var n = nums[i];
    if (n === "...") {
      html += '<span class="page-info">&hellip;</span>';
    } else {
      html += '<button class="btn-page' + (n === p ? " current" : "") + '" onclick="goPage(' + n + ')">' + n + "</button>";
    }
  }
  html += '<button class="btn-page" ' + (p === pages ? "disabled" : "") + ' onclick="goPage(' + (p + 1) + ')">Next &rarr;</button>';
  html += '<span class="page-info">Page ' + p + " of " + pages + " &middot; " + total.toLocaleString() + " results</span>";
  el.innerHTML = html;
}

function goPage(n) {
  state.page = n;
  renderActivities();
  document.querySelector(".main").scrollTo({ top: 0, behavior: "smooth" });
}

function renderCatList() {
  var counts = {};
  Object.keys(CATS).forEach(function(c) { counts[c] = 0; });
  DATA.forEach(function(a) { if (counts[a.cat] !== undefined) counts[a.cat]++; });

  var html = "";
  Object.keys(CATS).forEach(function(name) {
    var cfg = CATS[name];
    var safeId = name.replace(/[^a-zA-Z0-9]/g, "_");
    html += '<label class="cat-item">' +
      '<input type="checkbox" checked onchange="toggleCat(\'' + name.replace(/'/g, "\\'") + '\')" id="cat-' + safeId + '">' +
      '<span class="cat-dot" style="background:' + cfg.color + '"></span>' +
      '<span class="cat-name">' + name + "</span>" +
      '<span class="cat-count" id="cat-count-' + safeId + '">' + counts[name] + "</span>" +
    "</label>";
  });
  document.getElementById("cat-list").innerHTML = html;

  var priceOptions = [
    ["all", "All prices"],
    ["free", "Free"],
    ["under60", "Under $60"],
    ["60to100", "$60 &ndash; $100"],
    ["over100", "Over $100"]
  ];
  var priceHtml = "";
  priceOptions.forEach(function(opt) {
    priceHtml += '<label class="cat-item">' +
      '<input type="radio" name="price" value="' + opt[0] + '"' + (opt[0] === "all" ? " checked" : "") + ' onchange="setPrice(\'' + opt[0] + '\')">' +
      '<span class="cat-name">' + opt[1] + "</span>" +
    "</label>";
  });
  document.getElementById("price-list").innerHTML = priceHtml;
}

function updateCatCounts(filtered) {
  var counts = {};
  Object.keys(CATS).forEach(function(c) { counts[c] = 0; });
  filtered.forEach(function(a) { if (counts[a.cat] !== undefined) counts[a.cat]++; });
  Object.keys(CATS).forEach(function(cat) {
    var el = document.getElementById("cat-count-" + cat.replace(/[^a-zA-Z0-9]/g, "_"));
    if (el) el.textContent = counts[cat];
  });
}

function toggleCat(name) {
  if (state.cats.has(name)) state.cats.delete(name);
  else state.cats.add(name);
  state.page = 1;
  renderActivities();
}

function setPrice(val) {
  state.price = val;
  state.page = 1;
  renderActivities();
}

function addToPlan(id) {
  if (state.plan.find(function(p) { return p.id === id; })) return;
  var a = DATA.find(function(d) { return d.id === id; });
  if (!a) return;
  state.plan.push(a);
  savePlan();
  renderActivities();
  renderPlanner();
}

function removeFromPlan(id) {
  state.plan = state.plan.filter(function(p) { return p.id !== id; });
  savePlan();
  renderActivities();
  renderPlanner();
}

function clearPlan() {
  if (state.plan.length === 0) return;
  if (!confirm("Remove all " + state.plan.length + " activities from your shortlist?")) return;
  state.plan = [];
  savePlan();
  renderActivities();
  renderPlanner();
}

function savePlan() {
  localStorage.setItem("spring26_plan", JSON.stringify(state.plan));
}

function renderPlanner() {
  var count = state.plan.length;
  document.getElementById("plan-count").textContent = count;

  var sat = state.plan.filter(function(a) { return a.day === "Sat"; });
  var sun = state.plan.filter(function(a) { return a.day === "Sun"; });

  var conflictIds = {};
  function checkConflicts(items) {
    for (var i = 0; i < items.length; i++) {
      for (var j = i + 1; j < items.length; j++) {
        if (hasConflict(items[i], items[j])) {
          conflictIds[items[i].id] = true;
          conflictIds[items[j].id] = true;
        }
      }
    }
  }
  checkConflicts(sat);
  checkConflicts(sun);

  function renderPlanCard(a) {
    var isConflict = !!conflictIds[a.id];
    var priceStr = a.price || (a.purl ? "View fees" : "Free");
    return '<div class="plan-card' + (isConflict ? " conflict" : "") + '">' +
      '<button class="btn-remove" onclick="removeFromPlan(' + a.id + ')" title="Remove">&times;</button>' +
      '<div class="plan-card-name">' + esc(a.n) + "</div>" +
      '<div class="plan-card-meta">' + esc(a.loc) + "<br>" + esc(a.t) + " &middot; " + esc(a.dr) + "</div>" +
      '<div class="plan-card-price">' + esc(priceStr) + "</div>" +
      '<div class="plan-card-rn">#' + esc(a.rn) + "</div>" +
      (isConflict ? '<div class="conflict-badge">&#9888; Time overlap</div>' : "") +
    "</div>";
  }

  var body = document.getElementById("planner-body");
  if (count === 0) {
    body.innerHTML = '<div class="planner-empty">No activities added yet.<br>Browse and click "+ Add" to start planning.</div>';
  } else {
    var sortByTime = function(a, b) { return parseTimeRange(a.t).start - parseTimeRange(b.t).start; };
    var html = '<div class="planner-day-header">Saturday' + (sat.length ? " (" + sat.length + ")" : "") + "</div>";
    if (sat.length) {
      sat.sort(sortByTime).forEach(function(a) { html += renderPlanCard(a); });
    } else {
      html += '<div class="planner-empty">None added</div>';
    }
    html += '<div class="planner-day-header">Sunday' + (sun.length ? " (" + sun.length + ")" : "") + "</div>";
    if (sun.length) {
      sun.sort(sortByTime).forEach(function(a) { html += renderPlanCard(a); });
    } else {
      html += '<div class="planner-empty">None added</div>';
    }
    body.innerHTML = html;
  }

  var total = 0;
  var hasUnknown = false;
  state.plan.forEach(function(a) {
    var p = parsePrice(a.price);
    if (p !== null) total += p;
    else if (a.purl || !a.price) hasUnknown = true;
  });
  var totalEl = document.getElementById("plan-total");
  if (count === 0) {
    totalEl.textContent = "\u2014";
  } else {
    totalEl.textContent = "$" + total.toFixed(2) + (hasUnknown ? " + fees" : "");
  }
}

function printPlan() {
  window.print();
}

function initPills(groupId, stateKey) {
  document.getElementById(groupId).addEventListener("click", function(e) {
    var btn = e.target.closest(".pill");
    if (!btn) return;
    var pills = document.querySelectorAll("#" + groupId + " .pill");
    for (var i = 0; i < pills.length; i++) pills[i].classList.remove("active");
    btn.classList.add("active");
    state[stateKey] = btn.getAttribute("data-val");
    state.page = 1;
    renderActivities();
  });
}

var searchTimer;
document.getElementById("search").addEventListener("input", function(e) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(function() {
    state.search = e.target.value;
    state.page = 1;
    renderActivities();
  }, 180);
});

document.getElementById("sort-select").addEventListener("change", function(e) {
  state.sort = e.target.value;
  state.page = 1;
  renderActivities();
});

initPills("day-pills", "day");
initPills("time-pills", "time");
initPills("cg-pills", "cg");
renderCatList();
renderActivities();
renderPlanner();
