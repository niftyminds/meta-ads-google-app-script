/**
 * Meta Ads Reporting for Google Sheets
 * ------------------------------------
 * Verze s upraveným načítáním náhledů kreativ inspirovaným PMA:
 * - Při showCreativeImage=true a level='ad':
 * 1. Načtou se insights (metriky + ad_id).
 * 2. Pro ad_id se načte Ad objekt (pro creative{id}, preview_shareable_link, a názvy).
 * 3. Pro creative_id se načte AdCreative objekt (pro thumbnail_url, image_url).
 * 4. Do sheetu se přidají sloupce pro Thumbnail URL, Ad Image URL, Ad Preview Link.
 * - Odstraněn 'image_asset' breakdown pro tento účel.
 * - Funkce findBestImageUrl se nyní nepoužívá pro primární získání těchto 3 URL,
 * ale je ponechána pro případné budoucí alternativní strategie.
 */

// Globální konstanta pro verzi API
const API_VERSION = "v22.0";

// --- Settings Initialization ---
function initSettingsSheet() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName("Settings");
  if (!sh) {
    sh = ss.insertSheet("Settings");
  } else {
    sh.clearContents();
  }
  sh.getRange(1, 1, 1, 3).setValues([
    ["Account ID", "Access Token", "Account Name"],
  ]);
  sh.setFrozenRows(1);
}

// --- Fetch User’s Ad Accounts ---
function fetchUserAccounts() {
  const token = getToken();
  if (!token) throw new Error("Access Token chybí v Settings!B2");
  const apiVersion = API_VERSION;

  let url =
    `https://graph.facebook.com/${apiVersion}/me/adaccounts` +
    "?fields=id,name" +
    "&limit=10000" +
    "&access_token=" +
    encodeURIComponent(token);
  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const code = resp.getResponseCode();
  if (code !== 200) {
    throw new Error(
      "Chyba při načítání účtů: HTTP " + code + " — " + resp.getContentText()
    );
  }
  const data = JSON.parse(resp.getContentText()).data || [];

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName("Settings");
  if (!sh)
    throw new Error('List "Settings" nenalezen. Spusť initSettingsSheet().');

  const last = sh.getLastRow();
  if (last > 1) {
    sh.getRange(2, 1, last - 1, 1).clearContent();
    sh.getRange(2, 3, last - 1, 1).clearContent();
  }

  if (data.length) {
    const ids = data.map((o) => [o.id]);
    const names = data.map((o) => [o.name]);
    sh.getRange(2, 1, ids.length, 1).setValues(ids);
    sh.getRange(2, 3, names.length, 1).setValues(names);
  }

  SpreadsheetApp.getUi().alert("Načteno " + data.length + " účtů.");
}

// --- Menu & Dialogs ---
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Meta Ads")
    .addItem("🛠 Inicializovat Settings", "showInitDialog")
    .addItem("🔄 Načíst účty z Meta Ads", "fetchUserAccounts")
    .addItem("📈 Provést import dat", "showMetaDialog")
    .addItem("⚙️ Nastavit automatickou aktualizaci", "showCronDialog")
    .addToUi();
}

function showInitDialog() {
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutputFromFile("InitDialog")
      .setWidth(360)
      .setHeight(180),
    "Inicializace listu Settings"
  );
}

function showMetaDialog() {
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutputFromFile("MetaDialog")
      .setWidth(560)
      .setHeight(720),
    "Načíst data z Meta Ads"
  );
}

function showCronDialog() {
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutputFromFile("CronDialog")
      .setWidth(720)
      .setHeight(650),
    "Nastavení automatických aktualizací"
  );
}

// --- New Cron Configuration & Management ---
// ... (kód pro saveOrUpdateCronJob, deleteCronJob, listCronJobs, executeConfiguredJob zůstává stejný) ...
function deleteTriggerByUid(triggerUid) {
  if (!triggerUid) return false;
  const projectTriggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < projectTriggers.length; i++) {
    if (projectTriggers[i].getUniqueId() === triggerUid) {
      ScriptApp.deleteTrigger(projectTriggers[i]);
      Logger.log("Smazán trigger s UID: " + triggerUid);
      return true;
    }
  }
  Logger.log("Trigger s UID nebyl nalezen pro smazání: " + triggerUid);
  return false;
}

function saveOrUpdateCronJob(jobConfig) {
  try {
    if (
      !jobConfig ||
      !jobConfig.jobName ||
      !jobConfig.accounts ||
      !jobConfig.metrics ||
      !jobConfig.level ||
      !jobConfig.time
    ) {
      throw new Error("Chybějící nebo neplatné parametry v konfiguraci úlohy.");
    }
    if (
      jobConfig.jobName.length > 100 ||
      !/^[a-zA-Z0-9_-\s\u00C0-\u017F]+$/.test(jobConfig.jobName)
    ) {
      throw new Error(
        "Název úlohy je neplatný, příliš dlouhý nebo obsahuje nepovolené znaky."
      );
    }
    const timeParts = String(jobConfig.time).split(":");
    if (
      timeParts.length !== 2 ||
      isNaN(parseInt(timeParts[0])) ||
      isNaN(parseInt(timeParts[1]))
    ) {
      throw new Error("Čas spuštění musí být ve formátu HH:MM.");
    }
    const hour = parseInt(timeParts[0]);
    const minute = parseInt(timeParts[1]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw new Error("Neplatná hodnota času spuštění.");
    }
    const scriptProperties = PropertiesService.getScriptProperties();
    const jobName = jobConfig.jobName;
    const configKey = "CRON_CONFIG_" + jobName;
    const triggerIdKey = "CRON_TRIGGERID_" + jobName;
    const oldTriggerUid = scriptProperties.getProperty(triggerIdKey);
    if (oldTriggerUid) {
      deleteTriggerByUid(oldTriggerUid);
      scriptProperties.deleteProperty(
        "CRON_JOBNAME_FOR_TRIGGERID_" + oldTriggerUid
      );
    }
    const newTrigger = ScriptApp.newTrigger("executeConfiguredJob")
      .timeBased()
      .atHour(hour)
      .nearMinute(minute)
      .everyDays(1)
      .create();
    const newTriggerUid = newTrigger.getUniqueId();
    scriptProperties.setProperty(configKey, JSON.stringify(jobConfig));
    scriptProperties.setProperty(triggerIdKey, newTriggerUid);
    scriptProperties.setProperty(
      "CRON_JOBNAME_FOR_TRIGGERID_" + newTriggerUid,
      jobName
    );
    Logger.log(
      `Cron úloha "${jobName}" byla úspěšně uložena/aktualizována. Trigger UID: ${newTriggerUid}, Konfigurovaný čas: ${jobConfig.time}.`
    );
    return {
      success: true,
      message: `Úloha "${jobName}" uložena. Čas: ${jobConfig.time}`,
      triggerId: newTriggerUid,
      time: jobConfig.time,
    };
  } catch (e) {
    Logger.log(
      `Chyba při ukládání cron úlohy "${jobConfig.jobName || "NEZADÁNO"}": ${
        e.message
      } ${e.stack}`
    );
    return { success: false, message: `Chyba: ${e.message}` };
  }
}

function deleteCronJob(jobName) {
  try {
    if (!jobName) throw new Error("Název úlohy pro smazání nebyl zadán.");
    const scriptProperties = PropertiesService.getScriptProperties();
    const configKey = "CRON_CONFIG_" + jobName;
    const triggerIdKey = "CRON_TRIGGERID_" + jobName;
    const triggerUid = scriptProperties.getProperty(triggerIdKey);
    if (triggerUid) {
      deleteTriggerByUid(triggerUid);
      scriptProperties.deleteProperty(
        "CRON_JOBNAME_FOR_TRIGGERID_" + triggerUid
      );
    }
    scriptProperties.deleteProperty(configKey);
    scriptProperties.deleteProperty(triggerIdKey);
    Logger.log(`Cron úloha "${jobName}" byla úspěšně smazána.`);
    return { success: true, message: `Úloha "${jobName}" smazána.` };
  } catch (e) {
    Logger.log(
      `Chyba při mazání cron úlohy "${jobName}": ${e.message} ${e.stack}`
    );
    return { success: false, message: `Chyba: ${e.message}` };
  }
}

function listCronJobs() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const allProps = scriptProperties.getProperties();
  const jobs = [];
  for (const key in allProps) {
    if (key.startsWith("CRON_CONFIG_")) {
      const jobName = key.substring("CRON_CONFIG_".length);
      const config = JSON.parse(allProps[key]);
      const triggerId = scriptProperties.getProperty(
        "CRON_TRIGGERID_" + jobName
      );
      let triggerInfo = { uid: triggerId, time: config.time, active: false };
      if (triggerId) {
        const projectTriggers = ScriptApp.getProjectTriggers();
        const foundTrigger = projectTriggers.find(
          (t) => t.getUniqueId() === triggerId
        );
        if (foundTrigger) {
          triggerInfo.active = true;
        }
      }
      jobs.push({ jobName: jobName, config: config, triggerInfo: triggerInfo });
    }
  }
  return jobs;
}

function executeConfiguredJob(event) {
  const triggerUid = event.triggerUid;
  const scriptProperties = PropertiesService.getScriptProperties();
  const jobName = scriptProperties.getProperty(
    "CRON_JOBNAME_FOR_TRIGGERID_" + triggerUid
  );
  if (!jobName) {
    Logger.log(
      `CHYBA: Pro trigger UID '${triggerUid}' nebyl nalezen název cron úlohy.`
    );
    return;
  }
  const jobConfigString = scriptProperties.getProperty(
    "CRON_CONFIG_" + jobName
  );
  if (!jobConfigString) {
    Logger.log(
      `CHYBA: Pro cron úlohu '${jobName}' (trigger UID: ${triggerUid}) nebyla nalezena konfigurace.`
    );
    return;
  }
  const cfg = JSON.parse(jobConfigString);
  const timezone = Session.getScriptTimeZone();
  const yesterday = new Date(new Date().setDate(new Date().getDate() - 1));
  const dayFormatted = Utilities.formatDate(yesterday, timezone, "yyyy-MM-dd");
  Logger.log(
    ` Zahajuji cron úlohu: "${jobName}" pro datum: ${dayFormatted} (Trigger UID: ${triggerUid})`
  );
  Logger.log(
    ` Konfigurace úlohy "${jobName}": Účty: ${cfg.accounts.join(
      ", "
    )}, Metriky: ${cfg.metrics.join(", ")}, Úroveň: ${cfg.level}, Čas: ${
      cfg.time
    }, Zobrazit kreativy: ${!!cfg.showCreativeImage}`
  );
  let allSuccessful = true;
  cfg.accounts.forEach((accountIdRaw) => {
    const accountId = String(accountIdRaw).trim();
    Logger.log(`  ➡️ Import pro účet: ${accountId} (Úloha: ${jobName})`);
    try {
      getMetaAdsDataUI({
        accounts: [accountId],
        level: cfg.level || "ad",
        gran: "1",
        metrics: cfg.metrics || ["spend", "impressions"],
        timeRange: { since: dayFormatted, until: dayFormatted },
        clearSheet: false,
        showCreativeImage: cfg.showCreativeImage || false,
      });
      Logger.log(
        `  ✅ Úspěšně importováno pro účet: ${accountId} (Úloha: ${jobName})`
      );
    } catch (e) {
      Logger.log(
        `  ❌ CHYBA při importu pro účet ${accountId} (Úloha: ${jobName}): ${
          e.message
        }\n    Stack: ${e.stack || "Není k dispozici"}`
      );
      allSuccessful = false;
    }
  });
  if (allSuccessful) {
    Logger.log(
      ` Cron úloha "${jobName}" byla úspěšně dokončena pro všechny účty.`
    );
  } else {
    Logger.log(` Cron úloha "${jobName}" byla dokončena s některými chybami.`);
  }
}

// --- Settings Helpers ---
function getAccountList() {
  const sh = SpreadsheetApp.getActive().getSheetByName("Settings");
  if (!sh || sh.getLastRow() < 2) return [];
  const rows = sh
    .getRange(2, 1, sh.getLastRow() - 1, 3)
    .getValues()
    .filter((r) => r[0] && String(r[0]).trim() !== "");
  return rows.map(([id, , name]) => ({
    id: String(id).trim().replace(/^act_/i, ""),
    name: String(name).trim(),
  }));
}
const getToken = () => {
  const settingsSheet = SpreadsheetApp.getActive().getSheetByName("Settings");
  if (!settingsSheet) {
    Logger.log('List "Settings" nebyl nalezen. Prosím, spusťte inicializaci.');
    return null;
  }
  const tokenValue = settingsSheet.getRange("B2").getValue();
  return String(tokenValue).trim();
};

// --- Action-Type Map ---
const ACTION_MAP = {
  adds_to_cart: {
    action: ["offsite_conversion.fb_pixel_add_to_cart", "add_to_cart"],
    type: "count",
  },
  cost_per_add_to_cart: {
    action: ["offsite_conversion.fb_pixel_add_to_cart", "add_to_cart"],
    type: "cost",
  },
  checkouts_initiated: {
    action: [
      "offsite_conversion.fb_pixel_initiate_checkout",
      "initiate_checkout",
    ],
    type: "count",
  },
  cost_per_checkout_initiated: {
    action: [
      "offsite_conversion.fb_pixel_initiate_checkout",
      "initiate_checkout",
    ],
    type: "cost",
  },
  purchases: {
    action: ["offsite_conversion.fb_pixel_purchase", "purchase"],
    type: "count",
  },
  cost_per_purchase: {
    action: ["offsite_conversion.fb_pixel_purchase", "purchase"],
    type: "cost",
  },
  view_content: {
    action: ["offsite_conversion.fb_pixel_view_content", "view_content"],
    type: "count",
  },
  cost_per_view_content: {
    action: ["offsite_conversion.fb_pixel_view_content", "view_content"],
    type: "cost",
  },
  leads: {
    action: [
      "offsite_conversion.fb_pixel_lead",
      "onsite_web_lead",
      "lead",
      "complete_registration",
    ],
    type: "count",
  },
  unique_actions_lead: {
    action: [
      "offsite_conversion.fb_pixel_lead",
      "onsite_web_lead",
      "lead",
      "complete_registration",
    ],
    type: "unique",
  },
  cost_per_lead: {
    action: [
      "offsite_conversion.fb_pixel_lead",
      "onsite_web_lead",
      "lead",
      "complete_registration",
    ],
    type: "cost",
  },
  link_click: { action: ["link_click"], type: "count" },
  cost_per_link_click: { action: ["link_click"], type: "cost" },
};

// --- Helpers ---
const num = (s) => String(s).replace(".", ",");
const extract = (arr, types) => {
  types = Array.isArray(types) ? types : [types];
  for (const t of types) {
    const o = (arr || []).find((x) => x.action_type === t);
    if (o) return o.value;
  }
  return "";
};
const arrayVal = (v) => (Array.isArray(v) ? v[0]?.value || "" : v);

// --- Account Name Cache ---
const _accNameCache = {};
function accountName(accIdRaw, token) {
  const accId = String(accIdRaw).replace(/^act_/i, "");
  if (_accNameCache[accId]) return _accNameCache[accId];
  const apiVersion = API_VERSION;
  try {
    const url = `https://graph.facebook.com/${apiVersion}/act_${accId}?fields=name&access_token=${encodeURIComponent(
      token
    )}`;
    const r = JSON.parse(
      UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText()
    );
    if (r.error) {
      Logger.log(
        `Chyba při načítání názvu účtu act_${accId}: ${r.error.message}`
      );
      _accNameCache[accId] = `act_${accId}`;
      return `act_${accId}`;
    }
    const n = r.name || `act_${accId}`;
    _accNameCache[accId] = n;
    return n;
  } catch (e) {
    Logger.log(`Výjimka při načítání názvu účtu act_${accId}: ${e.message}`);
    _accNameCache[accId] = `act_${accId}`;
    return `act_${accId}`;
  }
}

// --- Creative Image Helpers --- (Tyto funkce zůstávají pro findBestImageUrl, pokud bychom ji použili jako fallback)
function tryParseThumbnail(thumbnailUrl) {
  if (!thumbnailUrl) return null;
  try {
    const match = thumbnailUrl.match(/[?&]url=([^&]+)/);
    if (match && match[1]) {
      let fullUrl = decodeURIComponent(match[1]);
      fullUrl = fullUrl.replace(/^['"]|['"]$/g, "");
      if (fullUrl.startsWith("http")) {
        return fullUrl;
      }
    }
  } catch (e) {
    Logger.log(`Error parsing thumbnail URL ${thumbnailUrl}: ${e}`);
  }
  return null;
}

function fetchImageUrlByHash(
  imageHash,
  adAccountIdForHash,
  accessToken,
  apiVersion
) {
  if (!imageHash || !adAccountIdForHash || !accessToken || !apiVersion) {
    Logger.log("fetchImageUrlByHash: Chybějící parametry.");
    return null;
  }
  const adImageFields = "permalink_url,url";
  const cleanAdAccountIdForHash = String(adAccountIdForHash).replace(
    /^act_/i,
    ""
  );

  const hashesParam = encodeURIComponent(JSON.stringify([imageHash]));
  const adImageUrl = `https://graph.facebook.com/${apiVersion}/act_${cleanAdAccountIdForHash}/adimages?hashes=${hashesParam}&fields=${adImageFields}&access_token=${encodeURIComponent(
    accessToken
  )}`;

  Logger.log(
    `Fetching image by hash ${imageHash}. URL (bez tokenu): https://graph.facebook.com/${apiVersion}/act_${cleanAdAccountIdForHash}/adimages?hashes=${hashesParam}&fields=${adImageFields}&access_token=...`
  );

  try {
    const response = UrlFetchApp.fetch(adImageUrl, {
      muteHttpExceptions: true,
    });
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (responseCode === 200) {
      const imageData = JSON.parse(responseText);
      if (imageData && imageData.data && imageData.data.length > 0) {
        const imageEntry = imageData.data[0];
        if (imageEntry) {
          const foundUrl = imageEntry.permalink_url || imageEntry.url || null;
          Logger.log(`Found URL for hash ${imageHash}: ${foundUrl}`);
          return foundUrl;
        }
      } else if (imageData && imageData[imageHash]) {
        const imageEntry = imageData[imageHash];
        const foundUrl = imageEntry.permalink_url || imageEntry.url || null;
        Logger.log(
          `Found URL for hash ${imageHash} (fallback structure): ${foundUrl}`
        );
        return foundUrl;
      }
      Logger.log(
        `Hash ${imageHash} not found in expected structure in adimages response. Response: ${responseText.slice(
          0,
          500
        )}`
      );
    } else {
      Logger.log(
        `Error fetching image by hash ${imageHash}. Code: ${responseCode}, Response: ${responseText.slice(
          0,
          500
        )}`
      );
    }
  } catch (e) {
    Logger.log(
      `Exception fetching image by hash ${imageHash}: ${e.message} \nURL: ${adImageUrl}`
    );
  }
  return null;
}

function fetchImageFromPost(postId, accessToken, apiVersion) {
  if (!postId || !accessToken || !apiVersion) {
    Logger.log("fetchImageFromPost: Chybějící parametry.");
    return null;
  }
  const postFields =
    "full_picture,attachments{media{image{src}},subattachments{media{image{src}}}}";
  const postUrl = `https://graph.facebook.com/${apiVersion}/${postId}?fields=${encodeURIComponent(
    postFields
  )}&access_token=${encodeURIComponent(accessToken)}`;
  Logger.log(
    `Fetching post details for ID: ${postId} from URL: ${postUrl.substring(
      0,
      postUrl.indexOf("access_token=")
    )}...`
  );

  try {
    const response = UrlFetchApp.fetch(postUrl, { muteHttpExceptions: true });
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (responseCode === 200) {
      const postData = JSON.parse(responseText);
      if (postData.full_picture) {
        Logger.log(
          `Found full_picture for post ${postId}: ${postData.full_picture}`
        );
        return postData.full_picture;
      }
      if (
        postData.attachments &&
        postData.attachments.data &&
        postData.attachments.data.length > 0
      ) {
        const attachment = postData.attachments.data[0];
        if (
          attachment.media &&
          attachment.media.image &&
          attachment.media.image.src
        ) {
          Logger.log(
            `Found image in main attachment for post ${postId}: ${attachment.media.image.src}`
          );
          return attachment.media.image.src;
        }
        if (
          attachment.subattachments &&
          attachment.subattachments.data &&
          attachment.subattachments.data.length > 0
        ) {
          const subAttachment = attachment.subattachments.data[0];
          if (
            subAttachment.media &&
            subAttachment.media.image &&
            subAttachment.media.image.src
          ) {
            Logger.log(
              `Found image in first sub-attachment for post ${postId}: ${subAttachment.media.image.src}`
            );
            return subAttachment.media.image.src;
          }
        }
      }
    } else {
      Logger.log(
        `Error fetching post ${postId}. Code: ${responseCode}, Response: ${responseText.slice(
          0,
          500
        )}`
      );
    }
  } catch (e) {
    Logger.log(`Exception fetching post ${postId}: ${e}`);
  }
  return null;
}

function findBestImageUrl( // Tato funkce je komplexní a může být zjednodušena, pokud se zaměříme jen na nová pole
  creativeIdForLog,
  creativeInfo,
  accessToken,
  adAccountId,
  apiVersion
) {
  let imageUrl = null;
  Logger.log(
    `[${creativeIdForLog}] Starting to find best image. CreativeInfo: ${JSON.stringify(
      creativeInfo
    ).slice(0, 300)}...`
  );

  if (!creativeInfo || !accessToken || !adAccountId || !apiVersion) {
    Logger.log(
      `[${creativeIdForLog}] findBestImageUrl: Chybějící základní parametry.`
    );
    return null;
  }

  // Zkusíme prioritně nově požadovaná pole, pokud jsou v creativeInfo
  if (creativeInfo.thumbnail_url) {
    // "Thumbnail URL"
    Logger.log(
      `[${creativeIdForLog}] Používám creativeInfo.thumbnail_url: ${creativeInfo.thumbnail_url}`
    );
    return creativeInfo.thumbnail_url;
  }
  if (creativeInfo.image_url) {
    // "Ad Image URL"
    Logger.log(
      `[${creativeIdForLog}] Používám creativeInfo.image_url: ${creativeInfo.image_url}`
    );
    return creativeInfo.image_url;
  }

  // Fallback na starší logiku, pokud by nová pole nebyla naplněna
  if (creativeInfo.effective_object_story_id) {
    imageUrl = fetchImageFromPost(
      creativeInfo.effective_object_story_id,
      accessToken,
      apiVersion
    );
    if (imageUrl) return imageUrl;
  }

  imageUrl = tryParseThumbnail(creativeInfo.thumbnail_url); // Toto je již pokryto výše
  if (imageUrl) return imageUrl;

  if (creativeInfo.object_story_spec) {
    const spec = creativeInfo.object_story_spec;
    let imageHash = null;
    let ossImageUrl = null;

    if (spec.video_data && spec.video_data.image_url) {
      ossImageUrl = spec.video_data.image_url;
    } else if (spec.link_data) {
      if (
        spec.link_data.picture &&
        (!spec.link_data.child_attachments ||
          spec.link_data.child_attachments.length === 0)
      ) {
        ossImageUrl = spec.link_data.picture;
      }
      if (!ossImageUrl && spec.link_data.image_hash)
        imageHash = spec.link_data.image_hash;
      if (
        !imageHash &&
        !ossImageUrl &&
        spec.link_data.child_attachments &&
        spec.link_data.child_attachments.length > 0
      ) {
        const firstChild = spec.link_data.child_attachments[0];
        if (firstChild.picture) ossImageUrl = firstChild.picture;
        if (!ossImageUrl && firstChild.image_hash)
          imageHash = firstChild.image_hash;
      }
    } else if (spec.photo_data) {
      if (spec.photo_data.url) ossImageUrl = spec.photo_data.url;
      if (!ossImageUrl && spec.photo_data.image_hash)
        imageHash = spec.photo_data.image_hash;
    }
    if (
      !imageHash &&
      !ossImageUrl &&
      spec.asset_feed_spec &&
      spec.asset_feed_spec.images &&
      spec.asset_feed_spec.images.length > 0
    ) {
      const firstImageAsset = spec.asset_feed_spec.images[0];
      if (firstImageAsset.url) ossImageUrl = firstImageAsset.url;
      else if (firstImageAsset.hash) imageHash = firstImageAsset.hash;
    }
    if (ossImageUrl) return ossImageUrl;
    if (imageHash) {
      const cleanAdAccountId = String(adAccountId).replace(/^act_/i, "");
      imageUrl = fetchImageUrlByHash(
        imageHash,
        cleanAdAccountId,
        accessToken,
        apiVersion
      );
      if (imageUrl) return imageUrl;
    }
  }
  Logger.log(
    `[${creativeIdForLog}] No specific image URL found through P1-P4. Fallback to creative.thumbnail_url if any.`
  );
  return creativeInfo.thumbnail_url || null; // Poslední záchrana
}

// --- Main Import ---
function getMetaAdsDataUI(payload) {
  const {
    accounts,
    metrics,
    level = "ad",
    gran = "1",
    datePreset,
    timeRange,
    clearSheet = false,
    showCreativeImage = false,
  } = payload;

  const MAX_IDS_PER_REQUEST = 50;

  const token = getToken();
  if (!token) {
    Logger.log("Access Token chybí v Settings!B2. Import nelze provést.");
    throw new Error("Access Token chybí v Settings!B2");
  }
  const apiVersion = API_VERSION;

  if (!accounts || accounts.length === 0) {
    Logger.log("Nebyly vybrány žádné účty pro import.");
    throw new Error("Nebyly vybrány žádné účty pro import.");
  }

  const actionM = metrics.filter((m) => m in ACTION_MAP);
  const roasM = metrics.filter((m) => m.endsWith("_roas"));
  const requestableDirectMetrics = [
    "spend",
    "impressions",
    "clicks",
    "reach",
    "frequency",
    "outbound_clicks",
  ];

  function idColsOf(l) {
    let c = ["date_start"];
    if (l === "account") c.push("account_name");
    else if (l === "campaign") c.push("campaign_name");
    else if (l === "adset") c.push("campaign_name", "adset_name", "adset_id");
    else c.push("campaign_name", "adset_name", "ad_name", "ad_id");
    return [...new Set(c)];
  }

  function runInsightsQuery(accIdForApi, fldsForInsights, currentBreakdowns) {
    const invalidInsightsFields = ["creative_id", "creative", "creative{id}"];
    let fieldsToRequest = [...new Set(fldsForInsights)].filter(
      (f) => !invalidInsightsFields.includes(f) && f
    );
    if (!fieldsToRequest.includes("date_start"))
      fieldsToRequest.unshift("date_start");
    if (level === "ad" && !fieldsToRequest.includes("ad_id"))
      fieldsToRequest.push("ad_id");

    Logger.log(
      `[${accIdForApi}] INSIGHTS API - Fields requested: ${fieldsToRequest.join(
        ","
      )} Breakdowns: ${
        currentBreakdowns ? currentBreakdowns.join(",") : "None"
      }`
    );

    let qs = [
      `level=${level}`,
      `time_increment=${gran}`,
      "limit=10000",
      `fields=${encodeURIComponent(fieldsToRequest.join(","))}`,
      `access_token=${encodeURIComponent(token)}`,
    ].join("&");

    if (currentBreakdowns && currentBreakdowns.length > 0) {
      qs += `&breakdowns=${encodeURIComponent(currentBreakdowns.join(","))}`;
    } else if (actionM.length > 0 && !currentBreakdowns) {
      // Použijeme actionM definované v getMetaAdsDataUI
      qs += "&action_breakdowns=action_type";
    }

    if (datePreset) qs += `&date_preset=${datePreset}`;
    if (timeRange)
      qs += `&time_range=${encodeURIComponent(JSON.stringify(timeRange))}`;

    let url = `https://graph.facebook.com/${apiVersion}/${accIdForApi}/insights?${qs}`;
    const out = [];
    let pageCount = 0;
    while (url) {
      pageCount++;
      Logger.log(
        `Stránkování ${pageCount} pro ${accIdForApi}, level ${level}. URL (část): ${url.substring(
          0,
          Math.min(
            url.length,
            url.indexOf("access_token=") > 0
              ? url.indexOf("access_token=") + 13
              : 200
          )
        )}...`
      );
      const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      const code = resp.getResponseCode();
      const body = resp.getContentText();
      if (code !== 200) {
        Logger.log(
          `Chyba INSIGHTS API (${code}) pro účet ${accIdForApi} (Level: ${level}, Breakdowns: ${
            currentBreakdowns ? currentBreakdowns.join(",") : "N/A"
          }): ${body.slice(0, 500)}`
        );
        throw new Error(
          `Graph API chyba (${code}) pro ${accIdForApi} (Level: ${level}): ${
            JSON.parse(body).error?.message || body
          }`
        );
      }
      const r = JSON.parse(body);
      if (r.error) {
        Logger.log(
          `Chyba v datech INSIGHTS API pro účet ${accIdForApi} (Level: ${level}): ${r.error.message}`
        );
        throw new Error(r.error.message);
      }
      out.push(...r.data);
      url = r.paging?.next || null;
      if (pageCount > 100) {
        Logger.log("Překročen limit stránkování (100). Ukončuji.");
        break;
      }
    }
    return out;
  }

  accounts.forEach((accInput) => {
    const accIdRaw = String(accInput).trim();
    const accIdForApi = accIdRaw.startsWith("act_")
      ? accIdRaw
      : `act_${accIdRaw}`;
    const accIdClean = accIdRaw.replace(/^act_/i, "");
    const currentAccountName = accountName(accIdClean, token);

    const includeCreativeImageColumn = showCreativeImage && level === "ad";
    const idColsForSheet = idColsOf(level);

    const sheetNameBase = `${currentAccountName.substring(
      0,
      20
    )} - ${accIdClean} - ${level}`;
    const safeSheetName = sheetNameBase
      .replace(/[/\\?*:|\[\]]/g, "")
      .slice(0, 90);
    let sh = SpreadsheetApp.getActive().getSheetByName(safeSheetName);
    let finalHeaders = [];

    if (!sh) {
      if (clearSheet) {
        sh = SpreadsheetApp.getActive().insertSheet(safeSheetName);
        Logger.log(`Vytvořen nový list: "${safeSheetName}"`);
      } else {
        Logger.log(`List "${safeSheetName}" neexistuje. Přeskakuji.`);
        return;
      }
    }

    // Sestavení hlaviček
    let baseHeaders = [
      ...idColsForSheet.map((c) => c.replace(/_/g, " ").toUpperCase()),
      ...metrics.map((m) => m.replace(/_/g, " ").toUpperCase()),
    ];
    if (includeCreativeImageColumn) {
      finalHeaders = [
        "NÁHLED KREATIVY (IMAGE FN)",
        "THUMBNAIL URL",
        "AD IMAGE URL",
        "AD PREVIEW LINK",
        ...baseHeaders,
      ];
    } else {
      finalHeaders = baseHeaders;
    }

    if (clearSheet || sh.getLastRow() === 0) {
      sh.clearContents();
      sh.appendRow(finalHeaders);
      sh.setFrozenRows(1);
      Logger.log(
        `Hlavičky zapsány do listu "${safeSheetName}". Hlavičky: ${finalHeaders.join(
          ", "
        )}`
      );
    } else {
      // Pokud nečistíme, můžeme zkontrolovat, zda existující hlavičky odpovídají
      // Pro jednoduchost nyní předpokládáme, že pokud doplňujeme, struktura je již správná
      // nebo akceptujeme potenciální nesoulad.
      finalHeaders = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      Logger.log(
        `Používám existující hlavičky z listu "${safeSheetName}". Počet hlaviček: ${finalHeaders.length}`
      );
    }

    // Sestavení polí pro /insights dotaz
    let fieldsForInsights = [...idColsForSheet];
    const requiredBaseFields = new Set();
    if (
      metrics.includes("cpm") ||
      metrics.includes("ctr") ||
      metrics.includes("outbound_ctr") ||
      metrics.includes("link_click_through_rate")
    ) {
      requiredBaseFields.add("impressions");
    }
    if (
      metrics.includes("cpm") ||
      metrics.includes("cpc") ||
      metrics.includes("cost_per_outbound_click") ||
      metrics.includes("cost_per_link_click") ||
      actionM.some((m) => ACTION_MAP[m].type === "cost")
    ) {
      requiredBaseFields.add("spend");
    }
    if (metrics.includes("cpc") || metrics.includes("ctr")) {
      requiredBaseFields.add("clicks");
    }
    if (
      metrics.includes("outbound_ctr") ||
      metrics.includes("cost_per_outbound_click")
    ) {
      requiredBaseFields.add("outbound_clicks");
    }
    if (
      metrics.includes("link_click_through_rate") ||
      metrics.includes("cost_per_link_click")
    ) {
      if (!fieldsForInsights.includes("actions"))
        fieldsForInsights.push("actions");
    }

    requiredBaseFields.forEach((field) => {
      if (!fieldsForInsights.includes(field) && field)
        fieldsForInsights.push(field);
    });

    metrics.forEach((metric) => {
      if (ACTION_MAP[metric]) {
        // Akční pole se přidají níže
      } else if (roasM.includes(metric)) {
        if (!fieldsForInsights.includes(metric)) fieldsForInsights.push(metric);
      } else if (requestableDirectMetrics.includes(metric)) {
        if (!fieldsForInsights.includes(metric) && metric)
          fieldsForInsights.push(metric);
      }
    });
    if (actionM.length > 0) {
      if (!fieldsForInsights.includes("actions"))
        fieldsForInsights.push("actions");
      if (!fieldsForInsights.includes("cost_per_action_type"))
        fieldsForInsights.push("cost_per_action_type");
      if (!fieldsForInsights.includes("unique_actions"))
        fieldsForInsights.push("unique_actions");
    }
    fieldsForInsights = [...new Set(fieldsForInsights)];

    // Pro obrázky již nebudeme používat image_asset breakdown pro /insights
    const insightsData = runInsightsQuery(accIdForApi, fieldsForInsights, null);

    let adDetailsMap = new Map(); // ad_id -> { creative_id, ad_name, campaign_name, adset_name, preview_shareable_link }
    let creativeDataMap = new Map(); // creative_id -> { thumbnail_url, image_url }

    if (includeCreativeImageColumn && insightsData.length > 0) {
      const uniqueAdIds = [
        ...new Set(insightsData.map((r) => r.ad_id).filter(Boolean)),
      ];
      Logger.log(
        `[${accIdClean}] Nalezeno ${uniqueAdIds.length} unikátních ad_id pro načtení detailů reklam a kreativ.`
      );

      // Krok 1: Načtení creative_id a preview_shareable_link z Ad objektů
      if (uniqueAdIds.length > 0) {
        const fieldsForAdObjects =
          "id,name,campaign{name},adset{name},creative{id},preview_shareable_link";
        for (let i = 0; i < uniqueAdIds.length; i += MAX_IDS_PER_REQUEST) {
          const chunkOfAdIds = uniqueAdIds.slice(i, i + MAX_IDS_PER_REQUEST);
          const adDetailsUrl = `https://graph.facebook.com/${apiVersion}/?ids=${chunkOfAdIds.join(
            ","
          )}&fields=${encodeURIComponent(
            fieldsForAdObjects
          )}&access_token=${encodeURIComponent(token)}`;
          Logger.log(
            `[${accIdClean}] AD OBJECT API (dávka ${
              Math.floor(i / MAX_IDS_PER_REQUEST) + 1
            }): Načítání detailů pro ad_ids: ${chunkOfAdIds.join(",")}`
          );
          try {
            const resp = UrlFetchApp.fetch(adDetailsUrl, {
              muteHttpExceptions: true,
            });
            const data = JSON.parse(resp.getContentText());
            for (const adId in data) {
              if (data[adId] && !data[adId].error) {
                adDetailsMap.set(adId, {
                  ad_name: data[adId].name || "",
                  campaign_name: data[adId].campaign
                    ? data[adId].campaign.name
                    : "",
                  adset_name: data[adId].adset ? data[adId].adset.name : "",
                  creative_id: data[adId].creative
                    ? data[adId].creative.id
                    : null,
                  preview_shareable_link:
                    data[adId].preview_shareable_link || "",
                });
              } else {
                Logger.log(
                  `[${accIdClean}] Chyba při načítání detailů pro Ad ID ${adId}: ${
                    data[adId]
                      ? JSON.stringify(data[adId].error)
                      : "Neznámá chyba odpovědi"
                  }`
                );
              }
            }
          } catch (e) {
            Logger.log(
              `[${accIdClean}] Výjimka při načítání detailů Ad objektů: ${e.toString()}`
            );
          }
          if (
            uniqueAdIds.length > MAX_IDS_PER_REQUEST &&
            i + MAX_IDS_PER_REQUEST < uniqueAdIds.length
          )
            Utilities.sleep(1000);
        }
      }

      // Krok 2: Načtení thumbnail_url a image_url z AdCreative objektů
      const uniqueCreativeIds = [
        ...new Set(
          Array.from(adDetailsMap.values())
            .map((ad) => ad.creative_id)
            .filter(Boolean)
        ),
      ];
      if (uniqueCreativeIds.length > 0) {
        const fieldsForCreatives = "id,thumbnail_url,image_url"; // Můžeme přidat i object_story_spec, effective_object_story_id pro findBestImageUrl jako fallback
        for (
          let i = 0;
          i < uniqueCreativeIds.length;
          i += MAX_IDS_PER_REQUEST
        ) {
          const chunkOfCreativeIds = uniqueCreativeIds.slice(
            i,
            i + MAX_IDS_PER_REQUEST
          );
          const creativeDetailsUrl = `https://graph.facebook.com/${apiVersion}/?ids=${chunkOfCreativeIds.join(
            ","
          )}&fields=${encodeURIComponent(
            fieldsForCreatives
          )}&access_token=${encodeURIComponent(token)}`;
          Logger.log(
            `[${accIdClean}] AD CREATIVE API (dávka ${
              Math.floor(i / MAX_IDS_PER_REQUEST) + 1
            }): Načítání detailů pro creative_ids: ${chunkOfCreativeIds.join(
              ","
            )}`
          );
          try {
            const resp = UrlFetchApp.fetch(creativeDetailsUrl, {
              muteHttpExceptions: true,
            });
            const data = JSON.parse(resp.getContentText());
            for (const creativeId in data) {
              if (data[creativeId] && !data[creativeId].error) {
                creativeDataMap.set(creativeId, {
                  thumbnail_url: data[creativeId].thumbnail_url || "",
                  image_url: data[creativeId].image_url || "",
                  // Zde bychom mohli uložit i celý objekt data[creativeId] pro findBestImageUrl
                });
              } else {
                Logger.log(
                  `[${accIdClean}] Chyba při načítání detailů pro Creative ID ${creativeId}: ${
                    data[creativeId]
                      ? JSON.stringify(data[creativeId].error)
                      : "Neznámá chyba odpovědi"
                  }`
                );
              }
            }
          } catch (e) {
            Logger.log(
              `[${accIdClean}] Výjimka při načítání detailů AdCreative objektů: ${e.toString()}`
            );
          }
          if (
            uniqueCreativeIds.length > MAX_IDS_PER_REQUEST &&
            i + MAX_IDS_PER_REQUEST < uniqueCreativeIds.length
          )
            Utilities.sleep(1000);
        }
      }
    }

    const map = new Map();
    function keyOf(insightRecord) {
      // Klíč je nyní založen pouze na idColsForSheet, protože insightsData již nejsou rozpadnuta na úrovni assetu
      // Každý řádek z insightsData je unikátní kombinací date_start, ad_id atd.
      return idColsForSheet
        .map((colName) =>
          insightRecord[colName] === undefined ? "" : insightRecord[colName]
        )
        .join("|");
    }

    insightsData.forEach((insightRecord) => {
      const currentKey = keyOf(insightRecord);
      let rec = map.get(currentKey);
      if (!rec) {
        rec = {};
        idColsForSheet.forEach((colKey) => {
          rec[colKey] =
            insightRecord[colKey] !== undefined ? insightRecord[colKey] : "";
        });

        // Pokud zobrazujeme obrázky, doplníme názvy z adDetailsMap
        if (includeCreativeImageColumn && insightRecord.ad_id) {
          const adDetail = adDetailsMap.get(insightRecord.ad_id);
          if (adDetail) {
            if (idColsForSheet.includes("ad_name"))
              rec.ad_name = adDetail.ad_name || rec.ad_name;
            if (idColsForSheet.includes("campaign_name"))
              rec.campaign_name = adDetail.campaign_name || rec.campaign_name;
            if (idColsForSheet.includes("adset_name"))
              rec.adset_name = adDetail.adset_name || rec.adset_name;
          }
        }
      }

      metrics.forEach((metricName) => {
        if (ACTION_MAP[metricName]) {
          const { action, type } = ACTION_MAP[metricName];
          let v = "";
          const actArr = insightRecord.actions || [];
          const uniqArr = insightRecord.unique_actions || [];
          const cpaArr = insightRecord.cost_per_action_type || [];
          if (type === "cost") v = extract(cpaArr, action);
          else if (type === "unique") v = extract(uniqArr, action);
          else v = extract(actArr, action);

          if (v !== "" && v !== undefined) rec[metricName] = v;
          else if (rec[metricName] === undefined) rec[metricName] = "";
        } else {
          if (insightRecord[metricName] !== undefined) {
            rec[metricName] = arrayVal(insightRecord[metricName]);
          } else if (rec[metricName] === undefined) {
            rec[metricName] = "";
          }
        }
      });

      const spendNum = parseFloat(String(rec.spend || "0").replace(",", "."));
      const impressionsNum = parseInt(rec.impressions || "0");
      const clicksNum = parseInt(rec.clicks || "0");
      const outboundClicksNum = parseInt(rec.outbound_clicks || "0");
      let linkClicksNumForCalc = 0;
      if (
        metrics.includes("link_click_through_rate") ||
        metrics.includes("cost_per_link_click")
      ) {
        const linkClickActionTypes = ACTION_MAP.link_click
          ? ACTION_MAP.link_click.action
          : [];
        if (linkClickActionTypes.length > 0) {
          const linkClicksValue = extract(
            insightRecord.actions || [],
            linkClickActionTypes
          );
          linkClicksNumForCalc = parseInt(
            String(linkClicksValue || "0").replace(",", ".")
          );
          if (metrics.includes("link_click") && rec.link_click === undefined) {
            rec.link_click = linkClicksNumForCalc;
          }
        }
      }

      if (metrics.includes("cpm"))
        rec.cpm = impressionsNum > 0 ? (spendNum / impressionsNum) * 1000 : 0;
      if (metrics.includes("cpc"))
        rec.cpc = clicksNum > 0 ? spendNum / clicksNum : 0;
      if (metrics.includes("ctr"))
        rec.ctr = impressionsNum > 0 ? (clicksNum / impressionsNum) * 100 : 0;
      if (metrics.includes("outbound_ctr"))
        rec.outbound_ctr =
          impressionsNum > 0 ? (outboundClicksNum / impressionsNum) * 100 : 0;
      if (metrics.includes("cost_per_outbound_click"))
        rec.cost_per_outbound_click =
          outboundClicksNum > 0 ? spendNum / outboundClicksNum : 0;
      if (metrics.includes("link_click_through_rate"))
        rec.link_click_through_rate =
          impressionsNum > 0
            ? (linkClicksNumForCalc / impressionsNum) * 100
            : 0;

      map.set(currentKey, rec);
    });

    if (map.size === 0) {
      Logger.log(
        `Pro účet ${accIdClean} (list "${safeSheetName}") nebyla nalezena žádná data pro zadané parametry.`
      );
      return;
    }

    const rows = Array.from(map.values())
      .sort((a, b) => {
        const dateComparison = (a.date_start || "").localeCompare(
          b.date_start || ""
        );
        if (dateComparison !== 0) return dateComparison;
        // Pokud je includeCreativeImageColumn, idCols jsou jen date_start a ad_id, takže potřebujeme třídit podle ad_name z adDetailsMap
        const adNameA =
          includeCreativeImageColumn && a.ad_id
            ? (adDetailsMap.get(a.ad_id) || {}).ad_name
            : a.ad_name;
        const adNameB =
          includeCreativeImageColumn && b.ad_id
            ? (adDetailsMap.get(b.ad_id) || {}).ad_name
            : b.ad_name;
        const adNameComparison = (adNameA || "").localeCompare(adNameB || "");
        if (adNameComparison !== 0) return adNameComparison;
        return 0; // Další úrovně třídění nejsou potřeba, protože už nemáme image_asset breakdown
      })
      .map((rec) => {
        let rowData = [];
        finalHeaders.forEach((header) => {
          let valueToPush = "";
          const originalHeaderKey = header.toLowerCase().replace(/\s+/g, "_");

          if (header === "NÁHLED KREATIVY" && includeCreativeImageColumn) {
            const adDetail = adDetailsMap.get(rec.ad_id); // rec.ad_id by mělo existovat
            const creativeId = adDetail ? adDetail.creative_id : null;
            const creativeData = creativeId
              ? creativeDataMap.get(creativeId)
              : null;
            const thumbnailUrl = creativeData
              ? creativeData.thumbnail_url
              : null;
            // Použijeme thumbnail_url pro IMAGE funkci, pokud je k dispozici
            valueToPush = thumbnailUrl
              ? `=IMAGE("${thumbnailUrl}"; 4; 100; 100)`
              : "";
          } else if (header === "THUMBNAIL URL" && includeCreativeImageColumn) {
            const adDetail = adDetailsMap.get(rec.ad_id);
            const creativeId = adDetail ? adDetail.creative_id : null;
            const creativeData = creativeId
              ? creativeDataMap.get(creativeId)
              : null;
            valueToPush = creativeData ? creativeData.thumbnail_url : "";
          } else if (header === "AD IMAGE URL" && includeCreativeImageColumn) {
            const adDetail = adDetailsMap.get(rec.ad_id);
            const creativeId = adDetail ? adDetail.creative_id : null;
            const creativeData = creativeId
              ? creativeDataMap.get(creativeId)
              : null;
            valueToPush = creativeData ? creativeData.image_url : "";
          } else if (
            header === "AD PREVIEW LINK" &&
            includeCreativeImageColumn
          ) {
            const adDetail = adDetailsMap.get(rec.ad_id);
            valueToPush = adDetail ? adDetail.preview_shareable_link : "";
          } else if (rec[originalHeaderKey] !== undefined) {
            valueToPush = rec[originalHeaderKey];
            const isCalculatedOrKnownNumeric =
              [
                "cpm",
                "cpc",
                "ctr",
                "outbound_ctr",
                "cost_per_outbound_click",
                "link_click_through_rate",
              ].includes(originalHeaderKey) ||
              roasM.includes(originalHeaderKey) ||
              requestableDirectMetrics.includes(originalHeaderKey) ||
              (ACTION_MAP[originalHeaderKey] &&
                (ACTION_MAP[originalHeaderKey].type === "cost" ||
                  ACTION_MAP[originalHeaderKey].type === "count"));

            if (isCalculatedOrKnownNumeric) {
              if (
                typeof valueToPush === "number" ||
                (typeof valueToPush === "string" &&
                  String(valueToPush).trim() !== "" &&
                  !isNaN(Number(String(valueToPush).replace(",", "."))))
              ) {
                let numValue = Number(String(valueToPush).replace(",", "."));
                if (
                  originalHeaderKey === "ctr" ||
                  originalHeaderKey === "outbound_ctr" ||
                  originalHeaderKey === "link_click_through_rate"
                ) {
                  valueToPush = num(numValue.toFixed(2)) + "%";
                } else if (
                  originalHeaderKey === "cpm" ||
                  originalHeaderKey === "cpc" ||
                  originalHeaderKey === "cost_per_outbound_click" ||
                  (ACTION_MAP[originalHeaderKey] &&
                    ACTION_MAP[originalHeaderKey].type === "cost")
                ) {
                  valueToPush = num(numValue.toFixed(2));
                } else {
                  valueToPush = num(numValue);
                }
              }
            }
          }
          rowData.push(valueToPush);
        });
        return rowData;
      });

    if (rows.length) {
      const numColsInHeader = finalHeaders.length;
      const rowsToWrite = rows.map((r) => {
        let finalRow = r.slice(0, numColsInHeader);
        while (finalRow.length < numColsInHeader) {
          finalRow.push("");
        }
        return finalRow;
      });

      if (rowsToWrite.length > 0) {
        sh.getRange(
          sh.getLastRow() + 1,
          1,
          rowsToWrite.length,
          numColsInHeader
        ).setValues(rowsToWrite);
        Logger.log(
          `Zapsáno ${rowsToWrite.length} řádků do listu "${safeSheetName}" pro účet ${accIdClean}.`
        );
      } else {
        Logger.log(
          `Žádná data k zápisu (po úpravě řádků) pro účet ${accIdClean} do listu "${safeSheetName}".`
        );
      }
    } else {
      Logger.log(
        `Žádná data k zápisu pro účet ${accIdClean} do listu "${safeSheetName}".`
      );
    }
  });
  Logger.log("Hlavní importní funkce getMetaAdsDataUI dokončena.");
}

/*
**Poznámky k úpravám:**

* **Nové pole `link_click_through_rate`:** Přidáno do `calculatedMetrics` a implementován jeho výpočet. Předpokládá, že metrika `link_click` je definována v `ACTION_MAP` a její hodnota se získá z `actions` pole. Zajistil jsem, že pokud je tato metrika požadována, bude se z API vyžadovat i pole `actions`.
* **`requestableDirectMetrics`:** Zkontroloval jsem, zda obsahuje `outbound_clicks`, což je základ pro `outbound_ctr` a `cost_per_outbound_click`.
* **Sestavení `fieldsForInsights`:** Logika pro sestavení `fieldsForInsights` nyní lépe zajišťuje, že se přidají všechny potřebné základní metriky pro výpočty (včetně `actions` pro `link_click_through_rate`).
* **Výpočet metrik v `insightsData.forEach`:** Přidán výpočet pro `link_click_through_rate`. Získání `linkClicksNumForCalc` je nyní podmíněno tím, zda jsou metriky `link_click_through_rate` nebo `cost_per_link_click` skutečně požadovány. Také pokud je `link_click` požadován jako samostatná metrika, jeho hodnota se uloží do `rec`.
* **Formátování výstupu:** `link_click_through_rate` se nyní formátuje jako procento s dvěma desetinnými místy.

**Co je třeba zkontrolovat v `MetaDialog.html`:**
Ujistěte se, že v `MetaDialog.html` v poli `categorizedMetrics` máte možnost vybrat:
* `"link_click"` (např. s labelem "Link Clicks (Action)")
* `"cost_per_link_click"` (např. s labelem "Cost per Link Click (Action)")
* `"link_click_through_rate"` (např. s labelem "Link Click-Through Rate (Vypočítaná)")

Pokud tam tyto možnosti nemáte, je třeba je do `categorizedMetrics` přidat, aby si je uživatel mohl zvolit. Například do sekce "general" nebo "ecommerce".

**Příklad doplnění do `MetaDialog.html` (do `categorizedMetrics.general`):**
```javascript
// ... ostatní general metriky ...
{ value: "link_click", label: "Link Clicks (Action)" },
{ value: "cost_per_link_click", label: "Cost per Link Click (Action)" },
{ value: "link_click_through_rate", label: "Link Click-Through Rate (Vypočítaná)" }
```

Tento upravený skript by měl nyní správně zpracovávat i nově přidané metriky týkající se `link_click

*/
