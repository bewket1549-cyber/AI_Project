import { fireEvent, render, screen, within } from "@testing-library/react";
import axios from "axios";
import App from "./App";

jest.mock("axios", () => ({ get: jest.fn() }));

beforeEach(() => {
  axios.get.mockImplementation((url) => Promise.resolve({
    data: url.endsWith("/options")
      ? {
          ram_gb: [8],
          storage_gb: [128],
          battery_mah: [5000],
          display_size_inches: [6.7],
          refresh_rate_hz: [120],
          camera_mp: [50],
          models: ["Nothing Phone 2a"],
          processors: ["Dimensity 7200 Pro"],
          operating_systems: ["Android v14"],
          min_price: 650,
          max_price: 184999,
          inr_to_usd_rate: 0.010513,
          exchange_rate_date: "2026-10-27",
        }
      : {
          items: [{
            model: "Nothing Phone 2a",
            operating_system: "Android v14",
            price_inr: 23999,
            rating: 73,
            ram_gb: 8,
            storage: "Unknown",
            storage_gb: 128,
            processor: "Dimensity 7200 Pro",
            battery: "5000 mAh",
            display: "6.7 inches",
            camera: "50 MP",
            specification: "5G, Wi-Fi",
            memory: "Memory Card supported",
            has_fingerprint: "Yes",
            has_face_unlock: "Yes",
            is_original: "Original",
            image_search_url: "https://www.google.com/search?tbm=isch&q=Nothing+Phone+2a+8GB+RAM+128GB+storage",
            video_search_url: "https://www.youtube.com/results?search_query=Nothing+Phone+2a+8GB+RAM+128GB+storage",
            gif_search_url: "https://tenor.com/search/Nothing%20Phone%202a%208GB%20RAM%20128GB%20storage-gifs",
          }],
          total: 1,
        },
  }));
});

test("renders phone matches and switches to Amharic", async () => {
  render(<App />);

  expect(await screen.findByRole("heading", { name: "Nothing Phone 2a" })).toBeInTheDocument();
  expect(screen.getByText("$252.30")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Images" })).toHaveAttribute(
    "href",
    expect.stringContaining("Nothing+Phone+2a+8GB+RAM+128GB+storage")
  );
  expect(screen.getByRole("link", { name: "Videos" })).toHaveAttribute("href", expect.stringContaining("youtube.com"));
  expect(screen.getByRole("link", { name: "GIFs" })).toHaveAttribute("href", expect.stringContaining("tenor.com"));
  expect(within(screen.getByRole("article")).getByText("128 GB", { selector: "strong" })).toBeInTheDocument();
  fireEvent.click(screen.getByText("More phone details"));
  expect(screen.getByText("Dataset classification")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "አማ" }));

  expect(screen.getByRole("heading", { name: "ቀጣዩን ስልክዎን ያግኙ" })).toBeInTheDocument();
  expect(screen.getByLabelText("በጀት (USD)")).toBeInTheDocument();
});

test("specification mode searches without sending a price filter", async () => {
  render(<App />);

  fireEvent.click(await screen.findByRole("tab", { name: "By specifications" }));
  fireEvent.change(screen.getByLabelText("RAM"), { target: { value: "8" } });
  fireEvent.click(screen.getByRole("button", { name: "Show matching phones" }));

  expect(await screen.findByRole("heading", { name: "Nothing Phone 2a" })).toBeInTheDocument();
  const [, request] = axios.get.mock.calls.at(-1);
  expect(request.params.ram_gb).toBe("8");
  expect(request.params).not.toHaveProperty("min_price");
  expect(request.params).not.toHaveProperty("max_price");
});

test("combined mode converts a USD range and combines it with specs", async () => {
  render(<App />);

  fireEvent.click(await screen.findByRole("tab", { name: "Budget + specs" }));
  fireEvent.change(screen.getByLabelText("Budget (USD)"), { target: { value: "200-300" } });
  fireEvent.change(screen.getByLabelText("RAM"), { target: { value: "8" } });
  fireEvent.click(screen.getByRole("button", { name: "Show matching phones" }));

  await screen.findByRole("heading", { name: "Nothing Phone 2a" });
  const [, request] = axios.get.mock.calls.at(-1);
  expect(request.params).toMatchObject({ min_price: "19024", max_price: "28536", ram_gb: "8" });
});

test("one USD budget amount is treated as a maximum price", async () => {
  render(<App />);

  await screen.findByRole("heading", { name: "Nothing Phone 2a" });
  fireEvent.change(screen.getByLabelText("Budget (USD)"), { target: { value: "$200" } });
  fireEvent.click(screen.getByRole("button", { name: "Show matching phones" }));

  await screen.findByRole("heading", { name: "Nothing Phone 2a" });
  const [, request] = axios.get.mock.calls.at(-1);
  expect(request.params.max_price).toBe("19024");
  expect(request.params).not.toHaveProperty("min_price");
});

test("budget mode requires at least one price bound", async () => {
  render(<App />);

  await screen.findByRole("heading", { name: "Nothing Phone 2a" });
  const initialRequestCount = axios.get.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Show matching phones" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Enter one maximum price or a minimum-maximum range to search by budget."
  );
  expect(axios.get).toHaveBeenCalledTimes(initialRequestCount);
});
