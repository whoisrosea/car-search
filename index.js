const axios = require("axios");
const { Builder, By, until } = require("selenium-webdriver");
const { Options } = require('selenium-webdriver/chrome');
const fs = require("fs");
const xlsx = require("xlsx");

const mainUrl = "https://api2.myauto.ge/ru/products";
const userUrl = "https://api2.myauto.ge/ru/products";
const carUrl = "https://www.myauto.ge/ru/pr/";

const params = {
  TypeID: 0,
  ForRent: 0,
  ProdYearFrom: 2012,
  CurrencyID: 3,
  MileageType: 1,
  Locs: "2.3.4.7.15.30.113.52.37.48.47.44.41.31.40.39.38.36.53.54.16.14.13.12.11.10.9.8.6.5.55.56.57.59.58.61.62.63.64.66.71.72.74.75.76.77.78.80.81.82.83.84.85.86.87.88.91.96.97.101.109.116.119.122.127.131.133",
  UserTypes: 0,
  Customs: 0,
  WheelTypes: 0,
  Page: 1,
};

const users = [];

const fetchPhoneNumber = async (carId) => {
  let options = new Options();
  options.addArguments("headless"); // run in headless mode
  options.addArguments("disable-gpu"); // disable GPU hardware acceleration
  //g // bypass OS security model, VERY DANGEROUS (only use in trusted environments)
  options.addArguments("disable-dev-shm-usage"); // overcome limited resource problems
  options.addArguments("window-size=1920x1080"); // set window size (optional)

  let driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(options)
    .build();

  try {
    await driver.get(`${carUrl}${carId}`);
    const buttonLocator = By.xpath("//button[span[text()='Показать номер']]");

    let button = await driver.wait(until.elementLocated(buttonLocator), 20000);
    await driver.executeScript("arguments[0].scrollIntoView(true);", button);

    button = await driver.wait(until.elementIsVisible(button), 20000);

    try {
      await driver.executeScript("arguments[0].click();", button);
    } catch (err) {
      console.error("Direct click failed, attempting JavaScript click", err);
      await button.click();
    }

    await driver.wait(async () => {
      const text = await button.getText();
      const digits = text.replace(/\D/g, "");
      return digits.length === 9;
    }, 20000);

    const phoneNumber = await button.getText();
    return phoneNumber;
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await driver.quit();
  }
};

async function fetchUser(userId, user) {
  try {
    const response = await axios.get(userUrl, { params: { UserID: userId } });
    const items = response.data.data.items;
    if (items.length >= 2 && !users.some((u) => u.id === userId)) {
      const item = items[0];
      const phoneNumber = await fetchPhoneNumber(item.car_id);
      user.id = userId;
      user.name = decodeURIComponent(JSON.parse(`"${item.client_name}"`));
      user.link = `https://www.myauto.ge/ru/s?userId=${userId}`;
      user.count = items.length;
      user.phone = phoneNumber;
      console.log(user);
      addUserToExcel(user, "data.xlsx");
      users.push(user);
    }
  } catch (error) {
    console.error(`Error fetching items for user ${userId}:`, error.message);
  }
}

const fetchAllPages = async () => {
  let page = 1;
  let hasMorePages = true;

  while (hasMorePages) {
    try {
      const response = await axios.get(mainUrl, {
        params: { ...params, Page: page },
      });
      const items = response.data.data.items;

      if (items.length > 0) {
        for (const item of items) {
          let user = {
            id: item.user_id,
            name: "",
            phone: "",
            count: 0,
            link: "",
          };
          await fetchUser(item.user_id, user);
        }
        page++;
      } else {
        hasMorePages = false;
      }
    } catch (error) {
      console.error("Error making request:", error);
      hasMorePages = false;
    }
  }
};

fetchAllPages();

function addUserToExcel(user, outputPath) {
  let workbook;
  let worksheet;

  if (fs.existsSync(outputPath)) {
    workbook = xlsx.readFile(outputPath);
    worksheet = workbook.Sheets["Sheet1"];
  } else {
    workbook = xlsx.utils.book_new();
    worksheet = xlsx.utils.aoa_to_sheet([
      ["id", "name", "phone", "count", "link"],
    ]);
    xlsx.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  }

  const sheetData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

  const userRow = [user.id, user.name, user.phone, user.count, user.link];

  sheetData.push(userRow);

  const newWorksheet = xlsx.utils.aoa_to_sheet(sheetData);

  workbook.Sheets["Sheet1"] = newWorksheet;

  xlsx.writeFile(workbook, outputPath);
}
