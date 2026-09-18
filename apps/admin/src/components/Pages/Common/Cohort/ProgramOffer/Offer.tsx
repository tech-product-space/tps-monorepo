"use client";

import { useEffect, useState } from "react";
import type React from "react";

import { Button } from "@/components/ui/button";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { getOfferByName, updateOffer } from "@/services/offers/offerServices";
import { useNotification } from "@/helpers/NotificationContext";

export interface IProgramOffer {
  id?: number;
  program_name:
    | "pm_fellowship"
    | "ai_for_pm"
    | "interview_course"
    | "free_course";
  offer_valid_for: string;
  price: number;
  discount: number;
  cohort_seats: number;
  start_date: Date;
  duration: string;
  offer_valid_till: Date;
  brochure_link: string;
  usd_price: number;
  usd_discount: number;
  emi_amount: string;
  usd_emi_amount: string;
  tax_inclusive: boolean;
  usd_tax_inclusive: boolean;
}

const defaultFormData: IProgramOffer = {
  program_name: "pm_fellowship",
  offer_valid_for: "",
  price: 0,
  discount: 0,
  cohort_seats: 0,
  start_date: new Date(),
  duration: "",
  offer_valid_till: new Date(),
  brochure_link: "",
  usd_price: 0,
  usd_discount: 0,
  emi_amount: "",
  usd_emi_amount: "",
  tax_inclusive: true,
  usd_tax_inclusive: true,
};

export default function ProgramOffer() {
  const [activeTab, setActiveTab] = useState<
    "pm_fellowship" | "ai_for_pm" | "interview_course" | "free_course"
  >("pm_fellowship");

  const { showNotification } = useNotification();

  // Keep separate state for each tab
  const [formDataMap, setFormDataMap] = useState<{
    [key in
      | "pm_fellowship"
      | "ai_for_pm"
      | "interview_course"
      | "free_course"]: IProgramOffer;
  }>({
    pm_fellowship: defaultFormData,
    ai_for_pm: { ...defaultFormData, program_name: "ai_for_pm" },
    interview_course: {
      ...defaultFormData,
      program_name: "interview_course",
    },
    free_course: {
      ...defaultFormData,
      program_name: "free_course",
    },
  });

  const handleTabChange = (value: string) => {
    let programName:
      | "pm_fellowship"
      | "ai_for_pm"
      | "interview_course"
      | "free_course"
      | undefined;

    if (value === "PM Fellowship") programName = "pm_fellowship";
    else if (value === "AI for PM") programName = "ai_for_pm";
    else if (value === "Interview Course") programName = "interview_course";
    else if (value === "Free Course") programName = "free_course";

    if (programName) {
      setActiveTab(programName);
    }
  };

  const handleInputChange = (
    field: keyof IProgramOffer,
    value: string | number | Date | boolean
  ) => {
    setFormDataMap((prev) => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        [field]: value,
      },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateOffer(formDataMap[activeTab]);
      showNotification("success", "Program offer updated successfully!");
    } catch (error) {
      showNotification("error", "Failed");
    }
  };

const getReadableProgramName = (key: string) => {
  return key === "pm_fellowship"
    ? "PM Fellowship"
    : key === "ai_for_pm"
    ? "AI for PM"
    : key === "interview_course"
    ? "Interview Course"
    : "Free Course";
};

  const fetchOffer = async (
    program_name:
      | "pm_fellowship"
      | "ai_for_pm"
      | "interview_course"
      | "free_course"
  ) => {
    try {
      const data = await getOfferByName(program_name);
      setFormDataMap((prev) => ({
        ...prev,
        [program_name]: {
          ...data,
          start_date: new Date(data.start_date),
          offer_valid_till: new Date(data.offer_valid_till),
        },
      }));
    } catch (error) {
      console.error(`Error fetching offer for ${program_name}:`, error);
      setFormDataMap((prev) => ({
        ...prev,
        [program_name]: { ...defaultFormData, program_name },
      }));
    }
  };

  // Fetch data whenever active tab changes
  useEffect(() => {
    fetchOffer(activeTab);
  }, [activeTab]);

  return (
    <div className="w-full max-w-7xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Program Offer Form</CardTitle>
          <CardDescription>
            Create or update a program offer by selecting a program type and
            filling in the details.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={getReadableProgramName(activeTab)}
            onValueChange={handleTabChange}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="PM Fellowship">PM Fellowship</TabsTrigger>
              <TabsTrigger value="AI for PM">AI for PM</TabsTrigger>
              <TabsTrigger value="Interview Course">
                Interview Course
              </TabsTrigger>
              {/* <TabsTrigger value="Free Course">Free Course</TabsTrigger> */}
            </TabsList>

            <TabsContent value="PM Fellowship" className="mt-6">
              <ProgramForm
                programName="PM Fellowship"
                formData={formDataMap.pm_fellowship}
                onInputChange={handleInputChange}
                onSubmit={handleSubmit}
              />
            </TabsContent>

            <TabsContent value="AI for PM" className="mt-6">
              <ProgramForm
                programName="AI for PM"
                formData={formDataMap.ai_for_pm}
                onInputChange={handleInputChange}
                onSubmit={handleSubmit}
              />
            </TabsContent>

            <TabsContent value="Interview Course" className="mt-6">
              <ProgramForm
                programName="Interview Course"
                formData={formDataMap.interview_course}
                onInputChange={handleInputChange}
                onSubmit={handleSubmit}
              />
            </TabsContent>

            {/* <TabsContent value="Free Course" className="mt-6">
              <ProgramForm
                programName="Free Course"
                formData={formDataMap.free_course}
                onInputChange={handleInputChange}
                onSubmit={handleSubmit}
              />
            </TabsContent> */}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

interface ProgramFormProps {
  programName: string;
  formData: IProgramOffer;
  onInputChange: (
    field: keyof IProgramOffer,
    value: string | number | Date | boolean
  ) => void;
  onSubmit: (e: React.FormEvent) => void;
}

const applyDiscount = (price: number, discount: number) =>
  Math.round((price * (100 - (discount || 0))) / 100);

const formatAmount = (symbol: string, amount: number, locale: string) =>
  `${symbol}${new Intl.NumberFormat(locale).format(amount || 0)}`;

/** Mirrors how the website renders a pricing card, so the numbers can be
 *  checked here instead of by saving and reloading the public page. */
function PricePreview({
  symbol,
  locale,
  price,
  discount,
  emi,
  taxInclusive,
}: {
  symbol: string;
  locale: string;
  price: number;
  discount: number;
  emi: string;
  taxInclusive: boolean;
}) {
  const payable = applyDiscount(price, discount);

  return (
    <div className="rounded-md bg-muted p-3 space-y-1">
      <p className="text-xs font-medium text-muted-foreground">
        Website preview
      </p>
      <p className="text-sm">
        <span className="text-lg font-semibold">
          {formatAmount(symbol, payable, locale)}
        </span>{" "}
        <span className="text-muted-foreground line-through">
          {formatAmount(symbol, price, locale)}
        </span>{" "}
        <span className="text-xs text-muted-foreground">
          ({discount || 0}% off &middot;{" "}
          {taxInclusive ? "Inclusive" : "Exclusive"} of all Taxes)
        </span>
      </p>
      <p className="text-xs text-muted-foreground">
        {emi?.trim()
          ? `EMI from ${symbol}${emi.trim().replace(/^[₹$]/, "")} available at checkout`
          : "No EMI line shown"}
      </p>
    </div>
  );
}

function ProgramForm({
  programName,
  formData,
  onInputChange,
  onSubmit,
}: ProgramFormProps) {
  const formatDateForInput = (date: Date | undefined) =>
    date ? date.toISOString().split("T")[0] : "";

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="program_name">Program Name</Label>
          <Input
            id="program_name"
            value={programName}
            disabled
            className="bg-muted"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="offer_valid_for">Offer Valid For</Label>
          <Input
            id="offer_valid_for"
            value={formData.offer_valid_for}
            onChange={(e) => onInputChange("offer_valid_for", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="cohort_seats">Cohort Seats</Label>
          <Input
            id="cohort_seats"
            value={formData.cohort_seats}
            onChange={(e) =>
              onInputChange("cohort_seats", parseInt(e.target.value) || 0)
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="start_date">Start Date</Label>
          <Input
            id="start_date"
            type="date"
            value={formatDateForInput(formData.start_date)}
            onChange={(e) =>
              onInputChange("start_date", new Date(e.target.value))
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="offer_valid_till">Offer Valid Till</Label>
          <Input
            id="offer_valid_till"
            type="date"
            value={formatDateForInput(formData.offer_valid_till)}
            onChange={(e) =>
              onInputChange("offer_valid_till", new Date(e.target.value))
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="duration">Duration</Label>
          <Input
            id="duration"
            value={formData.duration}
            onChange={(e) => onInputChange("duration", e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* India (INR) */}
        <div className="space-y-4 rounded-md border p-4">
          <h4 className="text-sm font-semibold">India (INR)</h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">Price (₹)</Label>
              <Input
                id="price"
                value={formData.price}
                onChange={(e) =>
                  onInputChange("price", parseFloat(e.target.value) || 0)
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="discount">Discount (%)</Label>
              <Input
                id="discount"
                value={formData.discount}
                onChange={(e) =>
                  onInputChange("discount", parseFloat(e.target.value) || 0)
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="emi_amount">EMI Amount</Label>
            <Input
              id="emi_amount"
              placeholder="1,295/month"
              value={formData.emi_amount ?? ""}
              onChange={(e) => onInputChange("emi_amount", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              No currency symbol — the website adds ₹. Leave empty to hide the
              EMI line.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm font-medium">Tax Inclusive</Label>
              <p className="text-xs text-muted-foreground">
                Off shows &quot;Exclusive of all Taxes&quot;
              </p>
            </div>
            <Switch
              checked={formData.tax_inclusive ?? true}
              onCheckedChange={(v) => onInputChange("tax_inclusive", v)}
            />
          </div>

          <PricePreview
            symbol="₹"
            locale="en-IN"
            price={formData.price}
            discount={formData.discount}
            emi={formData.emi_amount ?? ""}
            taxInclusive={formData.tax_inclusive ?? true}
          />
        </div>

        {/* International (USD) */}
        <div className="space-y-4 rounded-md border p-4">
          <h4 className="text-sm font-semibold">International (USD)</h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="usd_price">Price ($)</Label>
              <Input
                id="usd_price"
                value={formData.usd_price ?? 0}
                onChange={(e) =>
                  onInputChange("usd_price", parseFloat(e.target.value) || 0)
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="usd_discount">Discount (%)</Label>
              <Input
                id="usd_discount"
                value={formData.usd_discount ?? 0}
                onChange={(e) =>
                  onInputChange("usd_discount", parseFloat(e.target.value) || 0)
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="usd_emi_amount">EMI Amount</Label>
            <Input
              id="usd_emi_amount"
              placeholder="99/month"
              value={formData.usd_emi_amount ?? ""}
              onChange={(e) => onInputChange("usd_emi_amount", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              No currency symbol — the website adds $. Leave empty to hide the
              EMI line.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm font-medium">Tax Inclusive</Label>
              <p className="text-xs text-muted-foreground">
                Off shows &quot;Exclusive of all Taxes&quot;
              </p>
            </div>
            <Switch
              checked={formData.usd_tax_inclusive ?? true}
              onCheckedChange={(v) => onInputChange("usd_tax_inclusive", v)}
            />
          </div>

          <PricePreview
            symbol="$"
            locale="en-US"
            price={formData.usd_price}
            discount={formData.usd_discount}
            emi={formData.usd_emi_amount ?? ""}
            taxInclusive={formData.usd_tax_inclusive ?? true}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="brochure_link">Brochure Link</Label>
        <Input
          id="brochure_link"
          value={formData.brochure_link}
          onChange={(e) => onInputChange("brochure_link", e.target.value)}
        />
      </div>

      <div className="flex justify-end space-x-4">
        <Button type="button" variant="outline">
          Cancel
        </Button>
        <Button type="submit">Save Program Offer</Button>
      </div>
    </form>
  );
}
