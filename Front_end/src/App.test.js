import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axios from "axios";
import App from "./App";

jest.mock("axios", () => ({ get: jest.fn(), post: jest.fn() }));

let mockCatalogMaxPrice;

beforeEach(() => {
  mockCatalogMaxPrice = 1943.4;
  axios.get.mockImplementation((url) => {
    if (url.endsWith("/admin/status")) {
      return Promise.resolve({ data: { configured: false } });
    }
    if (url.endsWith("/options")) {
      return Promise.resolve({ data: {
          ram_gb: [8],
          storage_gb: [128],
          battery_mah: [5000],
          display_size_inches: [6.7],
          refresh_rate_hz: [120],
          camera_mp: [50],
          models: ["Nothing Phone 2a"],
          processors: ["Dimensity 7200 Pro"],
          operating_systems: ["Android v14"],
          specifications: ["5G, Wi-Fi"],
          memories: ["Memory Card supported"],
          markets: ["US"],
          ratings: [73],
          has_fingerprint: ["Not listed", "Yes", "No"],
          has_face_unlock: ["Not listed", "Yes", "No"],
          prices: [252.3],
          min_price: 6.83,
          max_price: mockCatalogMaxPrice,
          inr_to_usd_rate: 0.010513,
          exchange_rate_date: "2026-10-27",
      } });
    }
    if (url.endsWith("/phones/popular")) {
      return Promise.resolve({ data: { items: [{
        phone_id: 2,
        model: "Nothing Phone 2a",
        price_usd: 252.3,
        search_count: 5,
      }] } });
    }
    if (url.endsWith("/admin/phones")) {
      return Promise.resolve({ data: { items: [
        { phone_id: 2, model: "Alpha Phone" },
        { phone_id: 3, model: "Old Phone" },
        { phone_id: 1, model: "z Phone" },
      ] } });
    }
    if (url.endsWith("/phones/export/pdf")) {
      return Promise.resolve({ data: new Blob(["%PDF-1.4"]) });
    }
    if (url.endsWith("/pdf")) {
      return Promise.resolve({ data: new Blob(["%PDF-1.4"]) });
    }
    return Promise.resolve({ data: {
          items: [{
            phone_id: 2,
            model: "Nothing Phone 2a",
            operating_system: "Android v14",
            price_inr: 23999,
            price_usd: 252.3,
            rating: 73,
            ram_gb: 8,
            battery_mah: 5000,
            storage: "Unknown",
            storage_gb: 128,
            display_size_inches: 6.7,
            refresh_rate_hz: 120,
            camera_mp: 50,
            processor: "Dimensity 7200 Pro",
            camera: "50 MP",
            specification: "5G, Wi-Fi",
            memory: "Memory Card supported",
            has_fingerprint: "Not listed",
            has_face_unlock: "Not listed",
            exact_match: true,
            match_score: 100,
            market: "US",
            image_search_url: "https://www.google.com/search?tbm=isch&q=Nothing+Phone+2a+8GB+RAM+128GB+storage",
            video_search_url: "https://www.youtube.com/results?search_query=Nothing+Phone+2a+8GB+RAM+128GB+storage",
            gif_search_url: "https://tenor.com/search/Nothing%20Phone%202a%208GB%20RAM%20128GB%20storage-gifs",
          }],
          total: 1,
    } });
  });

  axios.post.mockImplementation((url) => Promise.resolve({
    data: url.endsWith("/recommendation")
      ? {
          phone_id: 2,
          model: "Nothing Phone 2a",
          recommended: true,
          label: "Recommended",
          recommendation_reason: "Recommended due to high battery capacity and an optimal 6.7-inch display size.",
          recommendation_score: 88,
          match_score: 90,
          confidence: 92,
        }
      : url.endsWith("/phones/recommendations")
      ? {
            items: [{
              phone_id: 2,
              model: "Nothing Phone 2a",
              price_usd: 252.3,
              rating: 73,
              ram_gb: 8,
              storage_gb: 128,
              battery_mah: 5000,
              display_size_inches: 6.7,
              refresh_rate_hz: 120,
              camera_mp: 50,
              processor: "Dimensity 7200 Pro",
              camera: "50 MP",
              operating_system: "Android v14",
              recommendation_score: 88,
              match_score: 90,
              predicted_label: "Recommended",
              confidence: 92,
              recommended: true,
            }],
            total: 1,
          }
      : url.endsWith("/admin/login")
      ? { access_token: "admin-session-token" }
      : url.endsWith("/admin/phones")
        ? { phone_id: 4 }
      : { created: true },
  }));
});

const lastPhoneSearchRequest = () =>
  axios.get.mock.calls.filter(([url]) => url.endsWith("/phones")).at(-1);

test("records anonymous search-interest totals and displays popular phones without a filter", async () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Find my phone" }));

  expect(await screen.findByRole("heading", { name: "Most searched phones" })).toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: /Nothing Phone 2a/ }));
  await waitFor(() => {
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining("/phones"),
      expect.objectContaining({ params: expect.objectContaining({ model: "Nothing Phone 2a" }) })
    );
  });
  expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining("/phones/search-interest"),
    { model: "Nothing Phone 2a" }
  );
});

test("admin signup checks that both passwords match", async () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Admin" }));
  await screen.findByRole("heading", { name: "Create the admin account" });
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Catalog Admin" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "admin@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "strong-admin-password" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "a-different-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Passwords do not match.");
  expect(axios.post).not.toHaveBeenCalledWith(
    expect.stringContaining("/admin/signup"),
    expect.anything()
  );
});

test("welcome has one get-started action to open the existing phone finder", async () => {
  render(<App />);

  expect(screen.getByRole("heading", { name: "Find the phone that fits your life." })).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Find my phone" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Find my phone" }));
  expect(await screen.findByRole("heading", { name: "Nothing Phone 2a" })).toBeInTheDocument();
});

test("admin link is available on the welcome page", async () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Admin" }));
  expect(await screen.findByRole("heading", { name: "Create the admin account" })).toBeInTheDocument();
  expect(screen.getByLabelText("Password")).toHaveAttribute("minLength", "8");
  expect(screen.getByLabelText("Confirm password")).toHaveAttribute("minLength", "8");
});

test("first admin signs up, then signs in to manage the catalog", async () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Admin" }));
  expect(await screen.findByRole("heading", { name: "Create the admin account" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Catalog Admin" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "admin@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "strong-admin-password" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "strong-admin-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

  expect(await screen.findByRole("heading", { name: "Sign in to manage the catalog" })).toBeInTheDocument();
  expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining("/admin/signup"),
    { full_name: "Catalog Admin", email: "admin@example.com", password: "strong-admin-password" }
  );
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "strong-admin-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByRole("heading", { name: "Manage smartphones" })).toBeInTheDocument();
  expect(await screen.findByText("3 catalog entries")).toBeInTheDocument();
  const phoneOptions = screen.getByRole("listbox").options;
  expect(phoneOptions[1].textContent).toContain("Alpha Phone");
  expect(phoneOptions[2].textContent).toContain("Old Phone");
  expect(phoneOptions[3].textContent).toContain("z Phone");
  expect(screen.queryByText(/Date added/)).not.toBeInTheDocument();
  expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining("/admin/login"),
    { email: "admin@example.com", password: "strong-admin-password" }
  );
});

test("adding a phone refreshes the finder price range", async () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Admin" }));
  await screen.findByRole("heading", { name: "Create the admin account" });
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Catalog Admin" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "admin@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "strong-admin-password" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "strong-admin-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
  await screen.findByRole("heading", { name: "Sign in to manage the catalog" });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "strong-admin-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("heading", { name: "Manage smartphones" });
  fireEvent.click(screen.getByRole("button", { name: "Add phone" }));
  expect(screen.getByRole("heading", { name: "Find a phone" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Add a new phone" })).toBeInTheDocument();
  expect(screen.getByLabelText("Search by model")).toBeInTheDocument();
  expect(screen.queryByLabelText("RAM / storage description")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Battery and charging description")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Display description")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Condition")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Touchscreen")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Fingerprint sensor")).toHaveValue("Not listed");
  expect(screen.getByLabelText("Face unlock")).toHaveValue("Not listed");
  expect(document.querySelector(".admin-content")).toHaveClass("admin-content-authenticated");
  expect(document.querySelector(".admin-form")).toBeInTheDocument();

  const newPhone = {
    Model: "New Price Phone",
    "Price (USD)": "2400",
    "Rating (0-100)": "90",
    Processor: "Example processor",
    "Operating system": "Android",
    "RAM (GB)": "12",
    "Storage (GB)": "256",
    "Battery (mAh)": "5000",
    "Display size (inches)": "6.7",
    "Refresh rate (Hz)": "120",
    "Main camera (MP)": "50",
  };
  Object.entries(newPhone).forEach(([label, value]) => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  });
  mockCatalogMaxPrice = 2400;
  fireEvent.click(screen.getByRole("button", { name: "Add to dataset" }));

  expect(await screen.findByRole("status")).toHaveTextContent("Phone added to the CSV dataset.");
  expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining("/admin/phones"),
    expect.objectContaining({
      has_fingerprint: "Not listed",
      has_face_unlock: "Not listed",
    }),
    expect.objectContaining({ headers: { "X-Admin-Token": "admin-session-token" } })
  );
  const newPhonePayload = axios.post.mock.calls.find(([url]) => url.endsWith("/admin/phones"))[1];
  expect(newPhonePayload).not.toHaveProperty("condition");
  expect(newPhonePayload).not.toHaveProperty("touchscreen");
  expect(newPhonePayload).not.toHaveProperty("data_source");
  await waitFor(() => {
    expect(axios.get.mock.calls.filter(([url]) => url.endsWith("/phones/options"))).toHaveLength(2);
  });
  fireEvent.click(screen.getByRole("button", { name: "Phone finder" }));
  expect(await screen.findByRole("button", { name: "Show lowest-priced phones: USD 6.83" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Show highest-priced phones: USD 2,400" })).toBeInTheDocument();
});

test("admin signup and sign-in forms can switch to Amharic", async () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Admin" }));
  expect(await screen.findByRole("heading", { name: "Create the admin account" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "አማ" }));
  expect(await screen.findByRole("heading", { name: "የአስተዳዳሪ መለያ ይፍጠሩ" })).toBeInTheDocument();
  expect(screen.getByLabelText("የይለፍ ቃል")).toHaveAttribute("minLength", "8");
  expect(screen.getByLabelText("የይለፍ ቃሉን ያረጋግጡ")).toHaveAttribute("minLength", "8");
});

test("renders phone matches and switches to Amharic", async () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Find my phone" }));
  expect(await screen.findByRole("heading", { name: "Nothing Phone 2a" })).toBeInTheDocument();
  expect(within(screen.getByRole("article")).getByText("$252.30")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Images" })).toHaveAttribute(
    "href",
    expect.stringContaining("Nothing+Phone+2a+8GB+RAM+128GB+storage")
  );
  expect(screen.getByRole("link", { name: "Videos" })).toHaveAttribute("href", expect.stringContaining("youtube.com"));
  expect(screen.getByRole("link", { name: "GIFs" })).toHaveAttribute("href", expect.stringContaining("tenor.com"));
  expect(within(screen.getByRole("article")).getByText("128 GB", { selector: "strong" })).toBeInTheDocument();
  fireEvent.click(screen.getByText("More phone details"));
  expect(screen.queryByText(/classification/i)).not.toBeInTheDocument();
  expect(screen.queryByText("Record source")).not.toBeInTheDocument();
  expect(screen.queryByText("Condition")).not.toBeInTheDocument();
  expect(screen.queryByText("Touchscreen")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "አማ" }));

  expect(screen.getByRole("heading", { name: "ቀጣዩን ስልክዎን ያግኙ" })).toBeInTheDocument();
  expect(screen.getByLabelText("ከፍተኛ በጀት (USD)")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /በዝቅተኛ ዋጋ ያሉ ስልኮችን አሳይ/ })).toBeInTheDocument();
});

test("unified search combines user-entered attributes in a single request", async () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Find my phone" }));
  await screen.findByRole("heading", { name: "Nothing Phone 2a" });
  fireEvent.change(screen.getByLabelText("RAM"), { target: { value: "8" } });
  fireEvent.change(screen.getByLabelText("Maximum budget (USD)"), { target: { value: "300" } });
  fireEvent.click(screen.getByRole("button", { name: "Find matching phones" }));

  expect(await screen.findByRole("heading", { name: "Nothing Phone 2a" })).toBeInTheDocument();
  const [, request] = lastPhoneSearchRequest();
  expect(request.params.ram_gb).toBe("8");
  expect(request.params.max_price).toBe("300");
  expect(screen.getByText("Exact Match")).toBeInTheDocument();
});

test("unified search keeps advanced filters collapsed and supports budget plus specifications", async () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Find my phone" }));
  await screen.findByRole("heading", { name: "Nothing Phone 2a" });
  const moreSpecifications = screen.getByText("More specifications");
  expect(moreSpecifications.closest("details")).not.toHaveAttribute("open");
  expect(screen.getByLabelText("Battery (mAh)")).not.toBeVisible();
  fireEvent.click(moreSpecifications);
  expect(screen.getByLabelText("Battery (mAh)")).toBeVisible();
  expect(screen.getByRole("button", { name: "Find matching phones" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Clear filters" })).toBeVisible();
  fireEvent.change(screen.getByLabelText("Maximum budget (USD)"), { target: { value: "300" } });
  fireEvent.change(screen.getByLabelText("RAM"), { target: { value: "8" } });
  fireEvent.click(screen.getByRole("button", { name: "Find matching phones" }));

  await screen.findByRole("heading", { name: "Nothing Phone 2a" });
  const [, request] = lastPhoneSearchRequest();
  expect(request.params).toMatchObject({ max_price: "300", ram_gb: "8" });
  expect(request.params).not.toHaveProperty("min_price");
});

test("a budget can be combined with any other unified search attributes", async () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Find my phone" }));
  await screen.findByRole("heading", { name: "Nothing Phone 2a" });
  fireEvent.change(screen.getByLabelText("Maximum budget (USD)"), { target: { value: "200" } });
  fireEvent.click(screen.getByRole("button", { name: "Find matching phones" }));

  await screen.findByRole("heading", { name: "Nothing Phone 2a" });
  const [, request] = lastPhoneSearchRequest();
  expect(request.params.max_price).toBe("200");
  expect(request.params).not.toHaveProperty("min_price");
});

test("clicking the lowest-price button sorts the catalog from cheapest to most expensive", async () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Find my phone" }));
  await screen.findByRole("heading", { name: "Nothing Phone 2a" });
  fireEvent.click(screen.getByRole("button", { name: "Show lowest-priced phones: USD 6.83" }));

  await screen.findByRole("heading", { name: "Nothing Phone 2a" });
  const [, request] = lastPhoneSearchRequest();
  expect(request.params.sort).toBe("price_asc");
  expect(request.params).not.toHaveProperty("max_price");
  expect(request.params).not.toHaveProperty("min_price");
});

test("clicking the highest-price button sorts the catalog from most expensive to cheapest", async () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Find my phone" }));
  await screen.findByRole("heading", { name: "Nothing Phone 2a" });
  fireEvent.click(screen.getByRole("button", { name: "Show highest-priced phones: USD 1,943.4" }));

  await screen.findByRole("heading", { name: "Nothing Phone 2a" });
  const [, request] = lastPhoneSearchRequest();
  expect(request.params.sort).toBe("price_desc");
  expect(request.params).not.toHaveProperty("max_price");
  expect(request.params).not.toHaveProperty("min_price");
});

test("unified search rejects invalid maximum prices", async () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Find my phone" }));
  await screen.findByRole("heading", { name: "Nothing Phone 2a" });
  const initialRequestCount = axios.get.mock.calls.length;
  fireEvent.change(screen.getByLabelText("Maximum budget (USD)"), { target: { value: "-1" } });
  fireEvent.click(screen.getByRole("button", { name: "Find matching phones" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Enter a valid price greater than zero."
  );
  expect(axios.get).toHaveBeenCalledTimes(initialRequestCount);
});

test("unified search allows an empty query to show the full catalog", async () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Find my phone" }));
  await screen.findByRole("heading", { name: "Nothing Phone 2a" });
  const initialRequestCount = axios.get.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Find matching phones" }));

  await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(initialRequestCount + 1));
  expect(lastPhoneSearchRequest()[1].params).toEqual({ limit: 24, offset: 0 });
});

test("downloads a PDF for the currently selected search filters", async () => {
  const createObjectUrl = jest.fn(() => "blob:catalog");
  const revokeObjectUrl = jest.fn();
  const clickLink = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  window.URL.createObjectURL = createObjectUrl;
  window.URL.revokeObjectURL = revokeObjectUrl;
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Find my phone" }));
  await screen.findByRole("heading", { name: "Nothing Phone 2a" });
  fireEvent.click(screen.getByRole("button", { name: "Download results as PDF" }));

  await waitFor(() => expect(createObjectUrl).toHaveBeenCalled());
  expect(axios.get).toHaveBeenCalledWith(
    expect.stringContaining("/phones/export/pdf"),
    { params: {}, responseType: "blob" }
  );
  expect(clickLink).toHaveBeenCalled();
  expect(revokeObjectUrl).toHaveBeenCalledWith("blob:catalog");
  clickLink.mockRestore();
});

test("downloads a separate PDF for an individual phone", async () => {
  const createObjectUrl = jest.fn(() => "blob:phone");
  const clickLink = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  window.URL.createObjectURL = createObjectUrl;
  window.URL.revokeObjectURL = jest.fn();
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Find my phone" }));
  await screen.findByRole("heading", { name: "Nothing Phone 2a" });
  fireEvent.click(screen.getByRole("button", { name: "Download phone PDF" }));

  await waitFor(() => expect(createObjectUrl).toHaveBeenCalled());
  expect(axios.get).toHaveBeenCalledWith(
    expect.stringContaining("/phones/2/pdf"),
    { params: undefined, responseType: "blob" }
  );
  expect(clickLink).toHaveBeenCalled();
  clickLink.mockRestore();
});

test("AI recommendations use user-selected specifications and show dataset-based scores", async () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Find my phone" }));
  await screen.findByRole("heading", { name: "Nothing Phone 2a" });
  fireEvent.change(screen.getByLabelText("RAM"), { target: { value: "8" } });
  fireEvent.click(screen.getByRole("button", { name: "Get AI recommendations" }));

  expect(await screen.findByText("AI recommendation")).toBeInTheDocument();
  expect(screen.getByText("Recommendation score: 88/100")).toBeInTheDocument();
  expect(screen.getByText("Preference match: 90%")).toBeInTheDocument();
  expect(screen.getByText("Model confidence: 92%")).toBeInTheDocument();
  expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining("/phones/recommendations"),
    expect.objectContaining({ ram_gb: "8", offset: 0, limit: 24 })
  );
});

test("each phone card opens a detailed AI recommendation modal", async () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Find my phone" }));
  await screen.findByRole("heading", { name: "Nothing Phone 2a" });
  fireEvent.click(screen.getByRole("button", { name: "Get AI Recommendation" }));

  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("Recommended")).toBeInTheDocument();
  expect(within(dialog).getByText(
    "Recommended due to high battery capacity and an optimal 6.7-inch display size."
  )).toBeInTheDocument();
  expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining("/phones/2/recommendation"),
    {}
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
