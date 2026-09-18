"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/gradient/components/ui/card";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import { Button } from "@/gradient/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/gradient/components/ui/select";
import { courseService } from "@/gradient/services/courseService";
import { Course, CoursePricing, GstMode } from "@/gradient/types/course";
import {
  applyDiscount,
  formatCohortDate,
  formatFullDate,
  formatRupees,
} from "../constants";

const EMPTY_PRICING: CoursePricing = {
  price: null,
  discountPercent: 0,
  cohortDate: "",
  offerValidTill: "",
  offerLabel: "",
  cohortSeats: null,
  durationLabel: "",
  gstMode: "inclusive",
  emiPlan: "",
};

/** Blank clears the field; anything else must be a whole count of seats. */
const toSeatInput = (raw: string) => (raw === "" ? null : Number(raw));

const isValidSeatCount = (seats: number | null) =>
  seats === null || (Number.isInteger(seats) && seats > 0);

export default function PricingSection({
  course,
  onSaved,
}: {
  course: Course;
  onSaved: () => void;
}) {
  const [pricing, setPricing] = useState<CoursePricing>({
    ...EMPTY_PRICING,
    ...course.pricing,
  });
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof CoursePricing>(
    key: K,
    value: CoursePricing[K],
  ) => setPricing((current) => ({ ...current, [key]: value }));

  const finalPrice = applyDiscount(pricing.price, pricing.discountPercent);
  const hasDiscount = pricing.discountPercent > 0 && (pricing.price || 0) > 0;

  const handleSave = async () => {
    if (pricing.discountPercent < 0 || pricing.discountPercent > 100) {
      toast.error("Discount must be between 0 and 100.");
      return;
    }

    // Mirrors the API's own check, so the common mistake is caught before a
    // round trip. The API stays the authority — it rejects the same value.
    if (!isValidSeatCount(pricing.cohortSeats)) {
      toast.error("Total cohort seats must be a whole number greater than 0.");
      return;
    }

    setSaving(true);

    try {
      await courseService.updateCourse(course.id, { pricing });
      toast.success(
        "Pricing updated. The website picks it up within 5 minutes.",
      );
      onSaved();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to save pricing.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Price</CardTitle>
            <CardDescription>
              Enter the full price and the discount. The payable amount shown on
              the site is calculated from the two, so they can never disagree.
            </CardDescription>
          </CardHeader>

          <CardContent className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="price">Course Price (₹)</Label>
              <Input
                id="price"
                type="number"
                min={0}
                value={pricing.price ?? ""}
                placeholder="59000"
                onChange={(e) =>
                  set("price", e.target.value ? Number(e.target.value) : null)
                }
              />
              <p className="text-xs text-muted-foreground">
                Before discount. Digits only — formatting is added for you.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="discount">Discount (%)</Label>
              <Input
                id="discount"
                type="number"
                min={0}
                max={100}
                value={pricing.discountPercent || ""}
                placeholder="30"
                onChange={(e) =>
                  set("discountPercent", Number(e.target.value) || 0)
                }
              />
              <p className="text-xs text-muted-foreground">
                Leave at 0 to show a single price with no discount badge.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gst">GST</Label>
              <Select
                value={pricing.gstMode}
                onValueChange={(value) => set("gstMode", value as GstMode)}
              >
                <SelectTrigger id="gst">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inclusive">Inclusive of GST</SelectItem>
                  <SelectItem value="exclusive">Exclusive of GST</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="emi">EMI Plan</Label>
              <Input
                id="emi"
                value={pricing.emiPlan}
                placeholder="6 Months"
                onChange={(e) => set("emiPlan", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to hide the EMI line on the site.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cohort</CardTitle>
          </CardHeader>

          <CardContent className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cohort-date">Cohort Start Date</Label>
              <Input
                id="cohort-date"
                type="date"
                value={pricing.cohortDate}
                onChange={(e) => set("cohortDate", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Shown as &ldquo;{formatCohortDate(pricing.cohortDate) ||
                  "Starts Aug 22"}
                &rdquo;.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Duration</Label>
              <Input
                id="duration"
                value={pricing.durationLabel}
                placeholder="4.5 Months"
                onChange={(e) => set("durationLabel", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cohort-seats">Total Cohort Seats</Label>
              <Input
                id="cohort-seats"
                type="number"
                min={1}
                step={1}
                value={pricing.cohortSeats ?? ""}
                placeholder="30"
                onChange={(e) =>
                  set("cohortSeats", toSeatInput(e.target.value))
                }
              />
              <p className="text-xs text-muted-foreground">
                Whole number. Drives both the seat count on the pricing panel
                and the &ldquo;Only {pricing.cohortSeats || 30} learners per
                batch&rdquo; badge in the hero. Leave empty to hide both.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Offer</CardTitle>
            <CardDescription>
              Urgency shown beside the price. Each line disappears from the site
              when its field is left empty, so a lapsed offer never lingers.
            </CardDescription>
          </CardHeader>

          <CardContent className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="offer-valid-till">Offer Valid Till</Label>
              <Input
                id="offer-valid-till"
                type="date"
                value={pricing.offerValidTill}
                onChange={(e) => set("offerValidTill", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Shown as &ldquo;Offer Valid Till :{" "}
                {formatFullDate(pricing.offerValidTill) || "Aug 19, 2026"}
                &rdquo;.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="offer-label">Offer Label</Label>
              <Input
                id="offer-label"
                value={pricing.offerLabel}
                placeholder="Early Bird Discount for 4 Seats Only!"
                onChange={(e) => set("offerLabel", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Printed on the site word for word, so the wording can change
                with the campaign. Leave empty to hide the line.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Pricing
          </Button>
        </div>
      </div>

      {/* Indicative rendering of the same values the course page receives. */}
      <div className="lg:sticky lg:top-6">
        <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Live Preview
        </p>

        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#3457DB] to-[#2442BE] p-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            {hasDiscount && (
              <span className="text-lg font-light text-white/55 line-through">
                {formatRupees(pricing.price)}
              </span>
            )}
            {hasDiscount && (
              <span className="rounded-full border border-white bg-[#00734E] px-3 py-1 text-xs font-medium text-white">
                {pricing.discountPercent}% Discount
              </span>
            )}
          </div>

          <p className="mt-3 text-4xl leading-none font-light tracking-tight text-white">
            {formatRupees(finalPrice) || "—"}
          </p>

          <p className="mt-2 text-xs font-light text-white/70">
            {pricing.gstMode === "exclusive"
              ? "Exclusive of GST"
              : "Inclusive of GST"}
          </p>

          {pricing.emiPlan && (
            <p className="mt-3 text-xs leading-4 font-light text-white/60">
              EMI from{" "}
              <strong className="font-semibold text-white/85">
                {pricing.emiPlan} plan
              </strong>{" "}
              available at checkout
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-4 border-t border-white/15 pt-4 text-xs text-white/80">
            <span>
              Next Cohort:{" "}
              <strong className="font-semibold text-white">
                {formatCohortDate(pricing.cohortDate) || "—"}
              </strong>
            </span>
            <span>
              Duration:{" "}
              <strong className="font-semibold text-white">
                {pricing.durationLabel || "—"}
              </strong>
            </span>
          </div>

          <div className="mt-4 space-y-2 text-xs text-white/80">
            {pricing.offerValidTill && (
              <p>
                Offer Valid Till :{" "}
                <strong className="font-semibold text-white">
                  {formatFullDate(pricing.offerValidTill)}
                </strong>
              </p>
            )}

            {pricing.offerLabel && <p>{pricing.offerLabel}</p>}

            {pricing.cohortSeats ? (
              <p>
                Total Cohort Seats :{" "}
                <strong className="font-semibold text-white">
                  {pricing.cohortSeats}
                </strong>
              </p>
            ) : null}
          </div>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Indicative only — each course page renders these values in its own
          design.
        </p>
      </div>
    </div>
  );
}
