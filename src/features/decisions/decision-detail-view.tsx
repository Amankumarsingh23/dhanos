"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SensitiveAmount } from "@/components/shared/sensitive-amount";
import { formatMoney } from "@/lib/money";
import {
  DECISION_ENTITY_TYPE_LABELS,
  DECISION_STATUS_LABELS,
  type DecisionEntityType,
  type DecisionStatus,
} from "@/lib/validation/decisions";
import {
  deleteDecisionAction,
  markDecidedAction,
  markReversedAction,
  markUnderReviewAction,
  recordOutcomeAction,
  setReviewDateAction,
} from "./actions";
import { DecisionDialog, type SelectOption } from "./decision-dialog";
import type { DecisionDetail, DecisionEntityLink } from "./queries";

type DecisionDetailViewProps = {
  householdId: string;
  decision: DecisionDetail;
  entityLink: DecisionEntityLink | null;
  supersedesTitle: string | null;
  supersededByTitle: string | null;
  entityOptions: Record<DecisionEntityType, SelectOption[]>;
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "—";
  return new Date(`${dateString}T00:00:00Z`).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function statusBadgeVariant(
  status: DecisionStatus,
): "secondary" | "outline" | "destructive" | "default" {
  if (status === "reversed") return "destructive";
  if (status === "decided") return "default";
  if (status === "superseded") return "secondary";
  return "outline";
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className="text-sm whitespace-pre-wrap">{value}</p>
    </div>
  );
}

export function DecisionDetailView({
  householdId,
  decision,
  entityLink,
  supersedesTitle,
  supersededByTitle,
  entityOptions,
}: DecisionDetailViewProps) {
  const router = useRouter();
  const status = decision.status as DecisionStatus;

  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [actualOutcome, setActualOutcome] = useState(decision.actual_outcome ?? "");
  const [lessonsLearned, setLessonsLearned] = useState(decision.lessons_learned ?? "");

  const [reversedOpen, setReversedOpen] = useState(false);
  const [reversedExplanation, setReversedExplanation] = useState("");

  const [reviewDateOpen, setReviewDateOpen] = useState(false);
  const [reviewDate, setReviewDate] = useState(decision.review_date ?? "");

  const [supersedeOpen, setSupersedeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleMarkDecided() {
    const result = await markDecidedAction(householdId, decision.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Marked decided");
    router.refresh();
  }

  async function handleMarkUnderReview() {
    const result = await markUnderReviewAction(householdId, decision.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Marked under review");
    router.refresh();
  }

  async function handleRecordOutcome() {
    setFormError(null);
    const result = await recordOutcomeAction(householdId, {
      decisionId: decision.id,
      actualOutcome: actualOutcome || null,
      lessonsLearned: lessonsLearned || null,
    });
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    toast.success("Outcome recorded");
    setOutcomeOpen(false);
    router.refresh();
  }

  async function handleMarkReversed() {
    setFormError(null);
    const result = await markReversedAction(householdId, {
      decisionId: decision.id,
      actualOutcome: reversedExplanation,
    });
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    toast.success("Marked reversed");
    setReversedOpen(false);
    router.refresh();
  }

  async function handleSetReviewDate() {
    const result = await setReviewDateAction(householdId, {
      decisionId: decision.id,
      reviewDate: reviewDate || null,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(reviewDate ? "Review date set" : "Review date cleared");
    setReviewDateOpen(false);
    router.refresh();
  }

  async function handleDelete() {
    const result = await deleteDecisionAction(householdId, decision.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Draft deleted");
    router.push("/app/decisions");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-lg">{decision.title}</CardTitle>
            <p className="text-muted-foreground text-sm">
              Decided {formatDate(decision.decision_date)}
              {decision.amount_minor_units !== null && decision.currency_code && (
                <>
                  {" "}
                  ·{" "}
                  <SensitiveAmount
                    value={formatMoney({
                      amountMinorUnits: decision.amount_minor_units,
                      currencyCode: decision.currency_code,
                    })}
                  />
                </>
              )}
            </p>
          </div>
          <Badge variant={statusBadgeVariant(status)}>
            {DECISION_STATUS_LABELS[status]}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {entityLink && (
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs font-medium">
                Related {DECISION_ENTITY_TYPE_LABELS[decision.entity_type as DecisionEntityType]}
              </p>
              {entityLink.href ? (
                <Link href={entityLink.href} className="text-sm hover:underline">
                  {entityLink.label}
                </Link>
              ) : (
                <p className="text-sm">{entityLink.label}</p>
              )}
            </div>
          )}

          {supersedesTitle && (
            <Alert>
              <AlertDescription>
                This entry replaces an earlier decision, &ldquo;{supersedesTitle}&rdquo;
                — its original entry is unchanged and still viewable.
              </AlertDescription>
            </Alert>
          )}
          {supersededByTitle && (
            <Alert>
              <AlertDescription>
                This decision was superseded by &ldquo;{supersededByTitle}&rdquo;. Its
                content below remains exactly as originally recorded.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Context" value={decision.context} />
            <Field label="Choice" value={decision.choice} />
            <Field label="Alternatives considered" value={decision.alternatives} />
            <Field label="Rationale" value={decision.rationale} />
            <Field label="Expected result" value={decision.expected_result} />
            <Field label="Risks" value={decision.risks} />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-xs font-medium">
                Review date
              </p>
              {(status === "decided" || status === "under_review") && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => setReviewDateOpen(true)}
                >
                  {decision.review_date ? "Change" : "Set a review date"}
                </Button>
              )}
            </div>
            <p className="text-sm">
              {decision.review_date
                ? `${formatDate(decision.review_date)} — a reminder will surface around this date`
                : "Not set"}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Actual outcome" value={decision.actual_outcome} />
            <Field label="Lessons learned" value={decision.lessons_learned} />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {status === "open" && (
          <>
            <Button onClick={handleMarkDecided}>Mark decided</Button>
            <Button variant="outline" onClick={() => setDeleteOpen(true)}>
              Delete draft
            </Button>
          </>
        )}
        {(status === "decided" || status === "under_review") && (
          <>
            <Button onClick={() => setOutcomeOpen(true)}>Record outcome</Button>
            {status === "decided" && (
              <Button variant="outline" onClick={handleMarkUnderReview}>
                Mark under review
              </Button>
            )}
            <Button variant="outline" onClick={() => setReversedOpen(true)}>
              Mark reversed
            </Button>
            <Button variant="outline" onClick={() => setSupersedeOpen(true)}>
              Supersede with a new decision
            </Button>
          </>
        )}
        {status === "reversed" && !supersededByTitle && (
          <Button variant="outline" onClick={() => setSupersedeOpen(true)}>
            Supersede with a new decision
          </Button>
        )}
      </div>

      <Dialog open={outcomeOpen} onOpenChange={setOutcomeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record outcome</DialogTitle>
          </DialogHeader>
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="actualOutcome">What actually happened</Label>
              <Textarea
                id="actualOutcome"
                value={actualOutcome}
                onChange={(event) => setActualOutcome(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lessonsLearned">Lessons learned (optional)</Label>
              <Textarea
                id="lessonsLearned"
                value={lessonsLearned}
                onChange={(event) => setLessonsLearned(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOutcomeOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRecordOutcome}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reversedOpen} onOpenChange={setReversedOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark this decision reversed</DialogTitle>
          </DialogHeader>
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="reversedExplanation">What happened / why reversed</Label>
            <Textarea
              id="reversedExplanation"
              value={reversedExplanation}
              onChange={(event) => setReversedExplanation(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReversedOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleMarkReversed}>
              Mark reversed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewDateOpen} onOpenChange={setReviewDateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review date</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reviewDateInput">Review date</Label>
            <Input
              id="reviewDateInput"
              type="date"
              value={reviewDate}
              onChange={(event) => setReviewDate(event.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              A reminder is generated automatically for this date.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSetReviewDate}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DecisionDialog
        householdId={householdId}
        open={supersedeOpen}
        onOpenChange={setSupersedeOpen}
        supersedes={decision}
        entityOptions={entityOptions}
        onSaved={(newId) => router.push(`/app/decisions/${newId}`)}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this draft?"
        description={`"${decision.title}" was never finalized. This removes it entirely — a decided decision is never deleted, only superseded or marked reversed.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
