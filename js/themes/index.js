// Theme registry. To add a theme: give it datasets (each with its own upload + mapping) and modules.
import * as carrierSchema from "./carrier/schema.js";
import { modules as carrierModules } from "./carrier/modules.js";

export const themes = [
  {
    id: "carrier",
    label: "Carrier Scorecard",
    status: "active",
    summary: "Compare carriers on on-time performance, cost, tender acceptance, and claims.",
    filterDate: { shipments: "ship_date", tenders: "tender_date" },
    datasets: carrierSchema.datasets,
    modules: carrierModules,
  },
  {
    id: "hr",
    label: "HR / Workday Exports",
    status: "soon",
    summary: "Headcount, turnover, hiring, labor hours, and absenteeism from HR system exports.",
    planned: ["Headcount & Org", "Turnover & Attrition", "Hiring Pipeline", "Labor Hours & Overtime", "Absenteeism"],
    datasets: [], modules: [],
  },
  {
    id: "demand",
    label: "Demand & Fulfillment",
    status: "soon",
    summary: "Demand trends, fill rate and OTIF, order cycle time, backorders, and SKU ABC analysis.",
    planned: ["Demand Trend", "Fill Rate & OTIF", "Order Cycle Time", "Backorders & Stockouts", "SKU ABC Analysis"],
    datasets: [], modules: [],
  },
];

export const themeById = (id) => themes.find((t) => t.id === id);
