const { chromium } = require("playwright");
const { BlobServiceClient } = require("@azure/storage-blob");
const fs = require("node:fs/promises");
const path = require("node:path");

const BASE_URL = "https://vitaboumcoworking.conexa.app/";
const SEARCH_URL = `${BASE_URL}index.php?r=booking/default/search`;
const AZURE_STORAGE_CONNECTION_STRING =
  process.env.AZURE_STORAGE_CONNECTION_STRING ?? "";
const AZURE_STORAGE_CONTAINER = "personal-files";

const EMAIL = process.env.VITABOUM_EMAIL || "lrsperanza@gmail.com";
const PASSWORD = process.env.VITABOUM_PASSWORD || "L@NaBBjb54Xdnfs";
const HEADLESS = process.env.HEADLESS !== "false";
const SLOW_MO = Number(process.env.SLOW_MO || 100);
const LAUNCH_TIMEOUT_MS = Number(process.env.LAUNCH_TIMEOUT_MS || 30000);

function getTodayDateString() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const DAY_NAMES = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

function buildDateAndTimeCode() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const dateCode = [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join("-");
  const timeCode = [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join("");
  return { dateCode, timeCode };
}

function csvEscape(value) {
  const stringValue = String(value ?? "");
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function withTimeout(promise, ms, stepName) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${stepName} timed out after ${ms}ms.`));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

async function launchBrowser() {
  const baseOptions = { headless: HEADLESS, slowMo: SLOW_MO };
  console.log(`[0/5] Launching Playwright browser (headless=${HEADLESS}, slowMo=${SLOW_MO})...`);

  try {
    return await withTimeout(
      chromium.launch(baseOptions),
      LAUNCH_TIMEOUT_MS,
      "Browser launch"
    );
  } catch (firstError) {
    if (process.platform === "win32") {
      console.log("[0/5] Retrying launch using installed Microsoft Edge channel...");
      return withTimeout(
        chromium.launch({ ...baseOptions, channel: "msedge" }),
        LAUNCH_TIMEOUT_MS,
        "Browser launch (msedge channel)"
      );
    }
    throw firstError;
  }
}

async function login(page) {
  console.log("[1/5] Opening Vitaboum login page...");
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

  const usernameInput = page.locator("#LoginForm_username");
  const passwordInput = page.locator("#LoginForm_password");

  await usernameInput.waitFor({ state: "visible", timeout: 20000 });
  console.log("[1/5] Filling credentials...");
  await usernameInput.fill(EMAIL);
  await passwordInput.fill(PASSWORD);

  const loginButton = page.locator("#loginButton");
  await loginButton.click();

  await page
    .waitForURL(
      (url) => !url.pathname.includes("login") && !url.href.includes("r=site/login"),
      { timeout: 20000 }
    )
    .catch(() => {});
  await page.waitForTimeout(2000);
  console.log("[1/5] Login submitted.");
}

async function navigateToCalendar(page) {
  console.log("[2/5] Navigating to booking search...");
  await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  console.log("[2/5] Switching to calendar view...");
  const calendarToggle = page.locator(".btn-toggle div:nth-child(2)");
  await calendarToggle.waitFor({ state: "attached", timeout: 10000 });
  await calendarToggle.click();

  await page.locator(".fc").waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(2000);
  console.log("[2/5] Calendar view active.");
}

/**
 * Extract all reservation events visible on the current FullCalendar weekly view.
 *
 * Each event `<a class="fc-event">` lives inside a `<td data-date="YYYY-MM-DD">`
 * and contains a `<ul class="list-events">` with `<li>` items:
 *   - "schedule" icon → time range  (e.g. "09:00 - 12:00")
 *   - "home"     icon → room name   (e.g. "Sala 5 - com Maca")
 *   - "lock"     icon → status      (e.g. "Reservada")
 */
async function extractWeekEvents(page) {
  return page.evaluate(() => {
    const events = [];
    const fcEvents = document.querySelectorAll(".fc-event");

    for (const el of fcEvents) {
      const dayCell = el.closest("td[data-date]");
      const date = dayCell ? dayCell.getAttribute("data-date") : "";

      const items = el.querySelectorAll("ul.list-events li");
      let timeRange = "";
      let room = "";
      let status = "";

      for (const li of items) {
        const icon = li.querySelector("i.material-symbols-outlined");
        const iconName = icon ? icon.textContent.trim() : "";
        const textNodes = Array.from(li.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent.trim())
          .filter(Boolean);
        const text = textNodes.join(" ").trim();

        if (iconName === "schedule") timeRange = text;
        else if (iconName === "home") room = text;
        else if (iconName === "lock" || iconName === "lock_open") status = text;
      }

      if (timeRange || room) {
        events.push({ date, timeRange, room, status });
      }
    }

    return events;
  });
}

function getWeekLabel(page) {
  return page
    .locator(".fc-toolbar-title")
    .textContent({ timeout: 5000 })
    .catch(() => "");
}


async function goToNextWeek(page) {
  const nextBtn = page.locator(".fc-next-button");
  const isDisabled = await nextBtn.getAttribute("disabled");
  if (isDisabled !== null) return false;
  await nextBtn.click();
  await page.waitForTimeout(2000);
  return true;
}


async function scrapeTodayEvents(page) {
  const today = getTodayDateString();
  const label = await getWeekLabel(page);
  console.log(`[3/5] Scraping current week: ${label}`);

  const weekEvents = await extractWeekEvents(page);
  console.log(`[3/5]   → ${weekEvents.length} total events found, filtering for today (${today})...`);

  const todayEvents = weekEvents.filter((e) => e.date === today);
  console.log(`[3/5]   → ${todayEvents.length} events for today.`);
  return todayEvents;
}

function parseEvents(rawEvents) {
  const reservations = [];

  for (const evt of rawEvents) {
    const { date, timeRange, room, status } = evt;

    let startTime = "";
    let endTime = "";
    let durationMinutes = 0;

    const match = timeRange.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
    if (match) {
      startTime = match[1];
      endTime = match[2];

      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      durationMinutes = eh * 60 + em - (sh * 60 + sm);
      if (durationMinutes < 0) durationMinutes += 1440;
    }

    let dayOfWeek = "";
    if (date) {
      const d = new Date(date + "T12:00:00");
      if (!isNaN(d)) dayOfWeek = DAY_NAMES[d.getDay()];
    }

    reservations.push({
      date,
      dayOfWeek,
      room,
      startTime,
      endTime,
      durationMinutes,
      status,
    });
  }

  return reservations;
}

function aggregateByRoomAndDay(reservations) {
  const summary = {};

  for (const r of reservations) {
    const key = `${r.room}|${r.dayOfWeek}`;
    if (!summary[key]) {
      summary[key] = {
        room: r.room,
        dayOfWeek: r.dayOfWeek,
        totalReservations: 0,
        totalMinutes: 0,
        dates: [],
      };
    }
    summary[key].totalReservations++;
    summary[key].totalMinutes += r.durationMinutes;
    summary[key].dates.push({
      date: r.date,
      start: r.startTime,
      end: r.endTime,
      durationMinutes: r.durationMinutes,
      status: r.status,
    });
  }

  return Object.values(summary).sort((a, b) =>
    a.room.localeCompare(b.room) || DAY_NAMES.indexOf(a.dayOfWeek) - DAY_NAMES.indexOf(b.dayOfWeek)
  );
}

async function exportResults(reservations, summary) {
  const { dateCode, timeCode } = buildDateAndTimeCode();
  const outputDir = path.join(process.cwd(), "collected-data");
  const filePrefix = `${dateCode}-vitaboum-availability-${timeCode}`;
  const jsonPath = path.join(outputDir, `${filePrefix}.json`);
  const csvPath = path.join(outputDir, `${filePrefix}.csv`);
  await fs.mkdir(outputDir, { recursive: true });

  const generatedAt = new Date().toISOString();
  const jsonPayload = {
    generatedAt,
    date: getTodayDateString(),
    totalReservations: reservations.length,
    reservations,
    summaryByRoomAndDay: summary,
  };

  const csvHeader = [
    "date",
    "day_of_week",
    "room",
    "start_time",
    "end_time",
    "duration_minutes",
    "status",
  ];
  const csvRows = reservations.map((r) =>
    [
      csvEscape(r.date),
      csvEscape(r.dayOfWeek),
      csvEscape(r.room),
      csvEscape(r.startTime),
      csvEscape(r.endTime),
      csvEscape(r.durationMinutes),
      csvEscape(r.status),
    ].join(",")
  );
  const csvContent = [csvHeader.join(","), ...csvRows].join("\n");

  const jsonContent = `${JSON.stringify(jsonPayload, null, 2)}\n`;
  const csvFileContent = `${csvContent}\n`;

  await Promise.all([
    fs.writeFile(jsonPath, jsonContent, "utf8"),
    fs.writeFile(csvPath, csvFileContent, "utf8"),
  ]);

  const filesToUpload = [
    {
      blobName: path.basename(jsonPath),
      content: jsonContent,
      contentType: "application/json; charset=utf-8",
    },
    {
      blobName: path.basename(csvPath),
      content: csvFileContent,
      contentType: "text/csv; charset=utf-8",
    },
  ];

  const uploadedFiles = await uploadExportsToAzure(filesToUpload);
  return { jsonPath, csvPath, uploadedFiles };
}

async function uploadExportsToAzure(files) {
  if (!AZURE_STORAGE_CONNECTION_STRING) {
    console.log("[!] Azure Storage connection string not set. Skipping upload.");
    return [];
  }

  const blobServiceClient = BlobServiceClient.fromConnectionString(
    AZURE_STORAGE_CONNECTION_STRING
  );
  const containerClient = blobServiceClient.getContainerClient(AZURE_STORAGE_CONTAINER);
  await containerClient.createIfNotExists();

  const uploadedFiles = [];
  for (const file of files) {
    const blockBlobClient = containerClient.getBlockBlobClient(
      "vitaboum-scraping/" + file.blobName
    );
    await blockBlobClient.uploadData(Buffer.from(file.content, "utf8"), {
      blobHTTPHeaders: { blobContentType: file.contentType },
    });
    uploadedFiles.push(blockBlobClient.url);
  }
  return uploadedFiles;
}

async function main() {
  console.log("Starting Vitaboum Coworking scraper...");

  let browser;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext();
    const page = await context.newPage();

    await login(page);
    await navigateToCalendar(page);

    console.log("[3/5] Scraping today's calendar events...");
    const rawEvents = await scrapeTodayEvents(page);

    console.log(`[4/5] Processing ${rawEvents.length} raw calendar events...`);
    const reservations = parseEvents(rawEvents);
    const summary = aggregateByRoomAndDay(reservations);

    console.log("\n=== Reservation Summary by Room & Day of Week ===");
    for (const s of summary) {
      const avgMin = s.totalReservations > 0 ? Math.round(s.totalMinutes / s.totalReservations) : 0;
      console.log(
        `  ${s.room.padEnd(35)} | ${s.dayOfWeek.padEnd(15)} | ${String(s.totalReservations).padStart(3)} reservations | ${String(s.totalMinutes).padStart(5)} min total | avg ${avgMin} min`
      );
    }

    console.log(`\n[5/5] Exporting ${reservations.length} reservations...`);
    const exported = await exportResults(reservations, summary);
    console.log(`JSON exported: ${exported.jsonPath}`);
    console.log(`CSV exported: ${exported.csvPath}`);
    for (const url of exported.uploadedFiles) {
      console.log(`Uploaded to Azure: ${url}`);
    }
  } catch (error) {
    console.error("Vitaboum scraper failed:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

main();
