const { chromium } = require("playwright");
const { BlobServiceClient } = require("@azure/storage-blob");
const fs = require("node:fs/promises");
const path = require("node:path");

const BASE_URL = "https://app.smartrooms.com.br/";
const RESERVATIONS_URL = `${BASE_URL}reserva.php`;
const AZURE_STORAGE_CONNECTION_STRING =
  process.env.AZURE_STORAGE_CONNECTION_STRING ?? "";
const AZURE_STORAGE_CONTAINER = "personal-files";

const TARGET_UNITS = [
  {
    formId: "form1",
    name: "Centro Profissional Ribeirao Shopping",
    namePattern: /Centro Profissional Ribeir[aã]o Shopping/i,
  },
  {
    formId: "form2",
    name: "High Business Franca",
    namePattern: /High Business Franca/i,
  },
  {
    formId: "form3",
    name: "Trio Office Ribeirao",
    namePattern: /Trio Office Ribeir[aã]o/i,
  },
];

// You can override these with environment variables if needed.
const EMAIL = process.env.SMARTROOMS_EMAIL || "lrsperanza@gmail.com";
const PASSWORD = process.env.SMARTROOMS_PASSWORD || "i@kTQ3n@3nuW";
const HEADLESS = process.env.HEADLESS !== "false";
const SLOW_MO = Number(process.env.SLOW_MO || 100);
const LAUNCH_TIMEOUT_MS = Number(process.env.LAUNCH_TIMEOUT_MS || 30000);

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

function sanitizeFilename(str) {
  return str.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_");
}

async function exportResults(results) {
  const { dateCode, timeCode } = buildDateAndTimeCode();
  const outputDir = path.join(process.cwd(), "collected-data");
  const filePrefix = `${dateCode}-smartrooms-availability-${timeCode}`;
  const jsonPath = path.join(outputDir, `${filePrefix}.json`);
  const csvPath = path.join(outputDir, `${filePrefix}.csv`);
  await fs.mkdir(outputDir, { recursive: true });

  const generatedAt = new Date().toISOString();

  // Build JSON payload without pageHtml (kept separate for manual verification)
  const jsonPayload = results.map(({ pageHtml, ...result }) => ({
    generatedAt,
    ...result,
    roomValue: `${result.unitName} - ${result.roomLabel} - ${result.roomValue}`,
  }));

  const csvHeader = ["unidade_id", "unidade", "idsala", "sala", "livre", "ocupado", "indisponivel"];
  const csvRows = results.map((result) =>
    [
      csvEscape(result.unitFormId),
      csvEscape(result.unitName),
      csvEscape(result.roomValue),
      csvEscape(result.roomLabel),
      csvEscape(result.livre),
      csvEscape(result.ocupado),
      csvEscape(result.indisponivel),
    ].join(",")
  );
  const csvContent = [csvHeader.join(","), ...csvRows].join("\n");
  const jsonContent = `${JSON.stringify(jsonPayload, null, 2)}\n`;
  const csvFileContent = `${csvContent}\n`;

  // Save HTML snapshots for each room (for manual verification)
  const htmlFiles = [];
  const writePromises = [
    fs.writeFile(jsonPath, jsonContent, "utf8"),
    fs.writeFile(csvPath, csvFileContent, "utf8"),
  ];

  for (const result of results) {
    if (!result.pageHtml) continue;
    const roomId = sanitizeFilename(`${result.unitFormId}-${result.roomLabel}`);
    const htmlFilename = `${filePrefix}-${roomId}.html`;
    const htmlPath = path.join(outputDir, htmlFilename);
    writePromises.push(fs.writeFile(htmlPath, result.pageHtml, "utf8"));
    htmlFiles.push({ path: htmlPath, filename: htmlFilename, content: result.pageHtml });
  }

  await Promise.all(writePromises);

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
    ...htmlFiles.map((f) => ({
      blobName: f.filename,
      content: f.content,
      contentType: "text/html; charset=utf-8",
    })),
  ];

  const uploadedFiles = await uploadExportsToAzure(filesToUpload);

  return { jsonPath, csvPath, htmlFiles: htmlFiles.map((f) => f.path), uploadedFiles };
}

async function uploadExportsToAzure(files) {
  if (!AZURE_STORAGE_CONNECTION_STRING) {
    throw new Error(
      "Azure Storage connection string is missing. Set AZURE_STORAGE_CONNECTION_STRING."
    );
  }

  const blobServiceClient = BlobServiceClient.fromConnectionString(
    AZURE_STORAGE_CONNECTION_STRING
  );
  const containerClient = blobServiceClient.getContainerClient(AZURE_STORAGE_CONTAINER);
  await containerClient.createIfNotExists();

  const uploadedFiles = [];

  for (const file of files) {
    const blockBlobClient = containerClient.getBlockBlobClient("smartrooms-scraping/" + file.blobName);
    await blockBlobClient.uploadData(Buffer.from(file.content, "utf8"), {
      blobHTTPHeaders: {
        blobContentType: file.contentType,
      },
    });
    uploadedFiles.push(blockBlobClient.url);
  }

  return uploadedFiles;
}

function withTimeout(promise, ms, stepName) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(
          `${stepName} timed out after ${ms}ms. If you are using Bun, try running with Node instead: node smartrooms-scraper.js`
        )
      );
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

async function launchBrowser() {
  const baseOptions = { headless: HEADLESS, slowMo: SLOW_MO };
  console.log(
    `[0/4] Launching Playwright browser (headless=${HEADLESS}, slowMo=${SLOW_MO})...`
  );

  try {
    return await withTimeout(
      chromium.launch(baseOptions),
      LAUNCH_TIMEOUT_MS,
      "Browser launch"
    );
  } catch (firstError) {
    // On some Windows setups, bundled Chromium can fail while Edge is available.
    if (process.platform === "win32") {
      console.log("[0/4] Retrying launch using installed Microsoft Edge channel...");
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
  console.log("[1/4] Opening SmartRooms login page...");
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

  const emailInput = page.locator(
    'input[type="email"], input[name*="email" i], input[id*="email" i]'
  );
  const passwordInput = page.locator(
    'input[type="password"], input[name*="senha" i], input[id*="senha" i], input[name*="password" i], input[id*="password" i]'
  );

  await emailInput.first().waitFor({ state: "visible", timeout: 20000 });
  console.log("[1/4] Filling credentials...");
  await emailInput.first().fill(EMAIL);
  await passwordInput.first().fill(PASSWORD);

  const submitButton = page.locator(
    'button[type="submit"], input[type="submit"], button:has-text("Entrar"), a:has-text("Entrar")'
  );

  if ((await submitButton.count()) > 0) {
    console.log("[1/4] Submitting login form...");
    await submitButton.first().click();
  } else {
    console.log("[1/4] Submitting login form with Enter...");
    await passwordInput.first().press("Enter");
  }

  // networkidle can hang on pages with long-polling/websockets.
  await page.waitForTimeout(1500);
  console.log("[1/4] Login submitted.");
}

async function openReservationsGrid(page) {
  console.log("[2/4] Opening reservations grid...");
  await page.goto(RESERVATIONS_URL, { waitUntil: "domcontentloaded" });
  await page.locator("a.reservas-link h3.reservas-nome").first().waitFor({
    state: "visible",
    timeout: 20000,
  });
  await page.waitForTimeout(1500);
}

async function openUnitReservation(page, unit) {
  console.log(`[3/4] Selecting unit ${unit.name} (${unit.formId})...`);
  const unitForm = page.locator(`form#${unit.formId}`).first();
  await unitForm.waitFor({ state: "visible", timeout: 20000 });

  const unitTitle = page
    .locator(`form#${unit.formId} a.reservas-link h3.reservas-nome`)
    .filter({ hasText: unit.namePattern })
    .first();
  await unitTitle.waitFor({ state: "visible", timeout: 20000 });
  await unitTitle.scrollIntoViewIfNeeded();
  const unitLink = unitTitle
    .locator("xpath=ancestor::a[contains(@class,'reservas-link')]")
    .first();
  try {
    await unitTitle.click({ timeout: 10000 });
  } catch {
    try {
      // This link triggers form submit via inline onclick; JS click is a reliable fallback.
      await unitLink.evaluate((el) => el.click());
    } catch {
      // Final fallback: submit the specific unit form directly.
      await page.locator(`form#${unit.formId}`).evaluate((form) => form.submit());
    }
  }
  await page.waitForTimeout(1500);

  console.log("[4/4] Opening reservation screen...");
  const selecionar = page
    .locator('input.cta-btn[value="Selecionar"], input[type="submit"][value="Selecionar"]')
    .first();
  await selecionar.waitFor({ state: "visible", timeout: 20000 });
  await selecionar.click();
  await page.waitForTimeout(1500);

  // Room switcher used to inspect each room's availability.
  await page.locator("select#idsala").first().waitFor({ state: "visible", timeout: 20000 });
}

async function countStatuses(page) {
  // Wait for at least one status badge to guarantee the grid loaded.
  await page
    .locator("span.badge.ok, span.badge.bad, span.badge.off")
    .first()
    .waitFor({ state: "visible", timeout: 20000 });

  const [livre, ocupado, indisponivel] = await Promise.all([
    page.locator("span.badge.ok").count(),
    page.locator("span.badge.bad").count(),
    page.locator("span.badge.off").count(),
  ]);

  // Check if the selected date matches today's date
  const now = new Date();
  const todayStr = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  
  const selectedDateText = await page.locator("select#dataconsulta").evaluate(el => el.options[el.selectedIndex]?.text).catch(() => null);
  
  if (selectedDateText && !selectedDateText.includes(todayStr)) {
    console.log(`[!] Selected date (${selectedDateText.trim()}) does not match today (${todayStr}). Defaulting to UNAVAILABLE.`);
    return { livre: 0, ocupado: 0, indisponivel: livre + ocupado + indisponivel };
  }

  return { livre, ocupado, indisponivel };
}

async function countStatusesByRoom(page) {
  console.log("[4/4] Counting statuses for each room (idsala)...");
  const roomOptions = await page.locator("select#idsala option").evaluateAll((options) =>
    options
      .map((option) => ({
        value: option.getAttribute("value") || "",
        label: (option.textContent || "").trim(),
        disabled: option.hasAttribute("disabled"),
      }))
      .filter((option) => option.value && !option.disabled)
  );

  if (roomOptions.length === 0) {
    throw new Error("No room options found in select#idsala.");
  }

  const roomResults = [];

  for (const room of roomOptions) {
    console.log(`[4/4] Checking room value=${room.value} (${room.label})...`);
    await page.selectOption("select#idsala", room.value);
    await page.waitForTimeout(1200);

    const statuses = await countStatuses(page);
    const pageHtml = await page.content();
    roomResults.push({
      roomValue: room.value,
      roomLabel: room.label,
      ...statuses,
      pageHtml,
    });
  }

  return roomResults;
}

async function main() {
  console.log("Starting SmartRooms scraper...");
  if (typeof Bun !== "undefined") {
    console.log(
      "Running with Bun detected. If launch hangs, run with Node for best Playwright compatibility."
    );
  }

  let browser;

  try {
    browser = await launchBrowser();
    const context = await browser.newContext();
    const page = await context.newPage();

    await login(page);
    const results = [];
    for (const unit of TARGET_UNITS) {
      await openReservationsGrid(page);
      await openUnitReservation(page, unit);
      const unitRoomResults = await countStatusesByRoom(page);
      results.push(
        ...unitRoomResults.map((roomResult) => ({
          unitFormId: unit.formId,
          unitName: unit.name,
          ...roomResult,
        }))
      );
    }

    console.log("SmartRooms availability check by room and unit:");
    for (const result of results) {
      console.log(
        `- [${result.unitFormId}] ${result.unitName} | [idsala=${result.roomValue}] ${result.roomLabel}: Livre=${result.livre}, Ocupado=${result.ocupado}, Indisponivel=${result.indisponivel}`
      );
    }

    const exported = await exportResults(results);
    console.log(`JSON exported: ${exported.jsonPath}`);
    console.log(`CSV exported: ${exported.csvPath}`);
    for (const htmlFile of exported.htmlFiles) {
      console.log(`HTML snapshot exported: ${htmlFile}`);
    }
    for (const uploadedFileUrl of exported.uploadedFiles) {
      console.log(`Uploaded to Azure Blob Storage: ${uploadedFileUrl}`);
    }
  } catch (error) {
    console.error("Scraping failed:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

main();
