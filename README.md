Meta Ads Reporting Skript pro Google Sheets
Úvod
Tento projekt Google Apps Script slouží k automatizovanému i manuálnímu importu dat o výkonu reklam z Meta Ads (Facebook Ads) přímo do Google Sheets. Umožňuje uživatelům snadno sledovat klíčové metriky svých reklamních kampaní, sestav a reklam, včetně možnosti zobrazení náhledů kreativ a nastavení pravidelných nočních aktualizací.
Funkce skriptu
Inicializace nastavení: Vytvoří dedikovaný list "Settings" pro uložení přístupového tokenu a ID reklamních účtů.
Načtení reklamních účtů: Automaticky načte všechny reklamní účty, ke kterým má uživatel přístup pomocí zadaného tokenu, a zapíše je do listu "Settings".
Uživatelské rozhraní v Google Sheets:
Vytvoří vlastní menu "Meta Ads" pro snadný přístup k funkcím skriptu.
Poskytuje dialogová okna pro:
Manuální import dat s výběrem účtů, časového období, úrovně reportu, metrik a granularity.
Nastavení a správu automatických denních aktualizací (cron jobů) pro vybrané účty a konfigurace.
Výběr metrik: Umožňuje výběr široké škály metrik, včetně:
Obecných metrik výkonu (Spend, Impressions, Clicks, Reach, Frequency, CPM, CPC, CTR).
Metrik pro odchozí prokliky (Outbound Clicks, Outbound CTR, Cost per Outbound Click).
E-commerce konverzních metrik (View Content, Add to Cart, Initiate Checkout, Purchases, ROAS a jejich ceny).
Lead Gen konverzních metrik (Leads, Cost per Lead, Unique Leads).
Granularita dat: Podporuje import dat s denní, týdenní, měsíční nebo roční granularitou.
Úrovně reportu: Umožňuje importovat data na úrovni účtu (Account), kampaně (Campaign), sestavy reklam (Ad Set) nebo reklamy (Ad).
Náhledy kreativ: Při importu na úrovni "Reklama" je možné volitelně zobrazit:
Náhled kreativy (pomocí funkce =IMAGE()).
Přímou URL náhledového obrázku (Thumbnail URL).
Přímou URL hlavního obrázku reklamy (Ad Image URL).
Odkaz na náhled reklamy (Ad Preview Link).
Automatické denní aktualizace (Cron):
Umožňuje vytvářet více nezávislých cron úloh.
Každá úloha může mít vlastní nastavení (účty, metriky, úroveň, čas spuštění, zobrazení kreativ).
Cron úlohy automaticky doplňují data za předchozí den.
Zpracování dat:
Automaticky vypočítává odvozené metriky jako CPM, CPC, CTR, Outbound CTR, Cost per Outbound Click, Link Click-Through Rate.
Zpracovává akční metriky pomocí action_breakdowns=action_type, pokud nejsou použity jiné rozpady.
Používá robustní metody pro získání URL obrázků kreativ, včetně přímých URL z AdCreative objektu a fallbacků.
Logování: Poskytuje podrobné logování pro diagnostiku a sledování průběhu importů.
Předpoklady
Účet Google s přístupem k Google Sheets a Google Apps Script.
Platný Přístupový token (Access Token) z Meta for Developers s potřebnými oprávněními (minimálně ads_read).
ID reklamního účtu (Ad Account ID), ze kterého chcete stahovat data (např. act_1234567890).
Nastavení
Vytvoření projektu Google Apps Script:
Otevřete Google Sheet, do kterého chcete importovat data.
V menu vyberte "Rozšíření" > "Apps Script". Otevře se editor skriptů.
Vložení kódu (.gs soubor):
Smažte veškerý existující kód v souboru Code.gs (nebo jak se jmenuje váš výchozí soubor).
Zkopírujte celý obsah poskytnutého skriptu .gs (např. meta_ads_reporting_v14_gs_pma_inspired_creatives.gs) a vložte ho do editoru.
Uložte projekt (ikona diskety nebo Ctrl+S).
Vytvoření HTML souborů:
V editoru Apps Script klikněte na "+" vedle "Soubory" a vyberte "HTML".
Vytvořte následující tři HTML soubory a do každého vložte odpovídající kód:
InitDialog.html (pro jednoduchý inicializační dialog - obsah může být základní, pokud není specificky navržen)
MetaDialog.html (pro dialog manuálního importu - použijte kód meta_dialog_html_v2_metric_sections.html nebo novější verzi s výběrem granularity)
CronDialog.html (pro dialog nastavení cronu - použijte kód cron_dialog_html_v3_leadgen.html nebo novější verzi s přesným časem)
Ujistěte se, že názvy souborů přesně odpovídají (včetně velikosti písmen).
Nastavení listu "Settings":
Po prvním uložení a obnovení Google Sheetu by se mělo objevit menu "Meta Ads".
Vyberte "Meta Ads" > "🛠 Inicializovat Settings". Tím se vytvoří list "Settings".
Do buňky B2 na listu "Settings" vložte váš platný Meta Ads API Access Token.
Můžete nechat skript automaticky načíst vaše reklamní účty ("Meta Ads" > "🔄 Načíst účty z Meta Ads"), nebo je vložit manuálně (ID účtu do sloupce A, název do sloupce C).
Použití
1. Inicializace
Spusťte "Meta Ads" > "🛠 Inicializovat Settings" pro vytvoření/resetování listu "Settings".
Vložte váš Access Token do buňky B2 na listu "Settings".
2. Načtení účtů
Spusťte "Meta Ads" > "🔄 Načíst účty z Meta Ads". Skript načte a zapíše vaše reklamní účty do listu "Settings".
3. Manuální import dat
Spusťte "Meta Ads" > "📈 Provést import dat".
V dialogovém okně vyberte:
Úroveň dat: Account, Campaign, Ad Set, nebo Ad.
Zobrazit náhled kreativy: (Aktivní pouze pro úroveň "Ad") Zda se mají načítat a zobrazovat URL a náhledy kreativ.
Časové období: Předdefinované (např. Včera, Poslední 7 dní) nebo vlastní rozsah dat.
Granularita dat: Denně, Týdně, Měsíčně, Ročně.
Metriky: Vyberte požadované metriky z rozdělených sekcí.
Reklamní účty: Vyberte jeden nebo více účtů pro import.
Vyčistit list: Zda se má existující list se stejným názvem vymazat před importem. Pokud není zaškrtnuto, data se připojí.
Klikněte na "Provést import". Data se importují do nových nebo existujících listů pojmenovaných podle účtu a úrovně.
4. Nastavení automatických aktualizací (Cron)
Spusťte "Meta Ads" > "⚙️ Nastavit automatickou aktualizaci".
V dialogovém okně můžete:
Vytvořit novou úlohu: Zadejte název úlohy, vyberte účty, metriky, úroveň, čas spuštění (HH:MM) a zda zobrazovat kreativy.
Spravovat existující úlohy: Zobrazí se seznam nakonfigurovaných úloh s možností je upravit nebo smazat.
Uložené cron úlohy automaticky každý den ve stanovený čas importují data za předchozí den pro nakonfigurované účty a nastavení.
Struktura kódu (Přehled)
Globální konstanty: API_VERSION.
Inicializační funkce: initSettingsSheet, fetchUserAccounts.
Menu a UI funkce: onOpen, showInitDialog, showMetaDialog, showCronDialog.
Správa Cronu: saveOrUpdateCronJob, deleteCronJob, listCronJobs, executeConfiguredJob, deleteTriggerByUid.
Pomocné funkce pro nastavení: getAccountList, getToken.
Mapování metrik: ACTION_MAP.
Obecné pomocné funkce: num, extract, arrayVal.
Cache pro názvy účtů: _accNameCache, accountName.
Pomocné funkce pro obrázky kreativ: tryParseThumbnail, fetchImageUrlByHash, fetchImageFromPost, findBestImageUrl.
Hlavní importní funkce: getMetaAdsDataUI (zpracovává logiku API volání, slučování dat a zápis do sheetu).
Vnořená funkce idColsOf: Určuje identifikační sloupce.
Vnořená funkce runInsightsQuery: Provádí samotné API volání na /insights.
Vnořená funkce keyOf: Generuje klíče pro slučování dat.
Možná budoucí vylepšení
Detailnější zpracování chyb a notifikace pro uživatele.
Možnost výběru konkrétních atribučních oken.
Podpora dalších rozpadů (breakdowns) v API.
Optimalizace pro velmi velké objemy dat (např. ukládání mezivýsledků).
Možnost ukládání obrázků na vlastní úložiště pro trvalé URL.
Poznámky
Ujistěte se, že váš Access Token má dostatečná oprávnění a je platný.
Při práci s velkým počtem účtů nebo dlouhými časovými obdobími může import trvat déle a narážet na limity Google Apps Script nebo Meta API.
Skript se snaží být robustní, ale Meta API se může měnit, což může vyžadovat budoucí úpravy.
