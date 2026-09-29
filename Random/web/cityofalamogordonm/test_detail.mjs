import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const testUrl = "https://cityofalamogordonm.munisselfservice.com/ess/EmploymentOpportunities/JobDetail.aspx?req=260099&sreq=1&form=GEN&desc=APD%20CIT%20PEER%20RECOVERY%20SPECIALIST";
  console.log("Navigating to:", testUrl);
  await page.goto(testUrl, { waitUntil: "networkidle" });
  
  const pageData = await page.evaluate(() => {
    // Extract all spans/divs/paragraphs/table cells with text
    const elements = Array.from(document.querySelectorAll("*"));
    const textMap = [];
    for (const el of elements) {
      if (el.children.length === 0 && el.textContent.trim()) {
        textMap.push({ tag: el.tagName, id: el.id, class: el.className, text: el.textContent.trim() });
      }
    }
    
    // Look for text in textareas or inputs or specific content containers
    const textareas = Array.from(document.querySelectorAll("textarea, input")).map(i => ({ id: i.id, val: i.value }));

    // Find description block
    // Notice in body text: "POSITION SUMMARY ..."
    // Let's find the main job details panel HTML
    const mainContainer = document.querySelector("#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_JobDetail1") ||
                          document.querySelector("#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_JobDetailControl") ||
                          document.querySelector(".mol-page-container") ||
                          document.body;

    return {
      mainContainerHTML: mainContainer.innerHTML,
      textareas
    };
  });
  
  const cardText = await page.evaluate(() => {
    const card = document.querySelector("tcw-card.jobDetailCard");
    return card ? card.innerText : document.body.innerText;
  });
  
  console.log("=== FULL CARD TEXT ===");
  console.log(cardText);
  
  await browser.close();
})();
