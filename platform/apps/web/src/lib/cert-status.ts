import { addMonths, daysBetween, type IsoDate } from "./dates.ts";
import { validityMonths } from "./validity.ts";

export type CertDisplayStatus = "not-started" | "studying" | "booked" | "passed" | "expiring" | "expired";

export interface ReportedStatus {
  state: "booked" | "passed";
  bookedFor: IsoDate | null;
  passedOn: IsoDate | null;
}

export interface CertStatusView {
  status: CertDisplayStatus;
  bookedFor?: IsoDate;
  passedOn?: IsoDate;
  expiresOn?: IsoDate;
  /** Days until expiry (negative once expired) or until the booked exam. */
  daysLeft?: number;
}

/** A passed cert inside this many days of expiry is "expiring". */
export const EXPIRY_WARNING_DAYS = 90;

export function expiryDate(certCode: string, passedOn: IsoDate): IsoDate {
  return addMonths(passedOn, validityMonths(certCode));
}

export function certStatusView(
  certCode: string,
  reported: ReportedStatus | undefined,
  today: IsoDate,
  opts: { studying?: boolean } = {},
): CertStatusView {
  if (reported?.state === "passed" && reported.passedOn) {
    const expiresOn = expiryDate(certCode, reported.passedOn);
    const daysLeft = daysBetween(today, expiresOn);
    const status: CertDisplayStatus = daysLeft <= 0 ? "expired" : daysLeft <= EXPIRY_WARNING_DAYS ? "expiring" : "passed";
    return { status, passedOn: reported.passedOn, expiresOn, daysLeft };
  }
  if (reported?.state === "booked") {
    return {
      status: "booked",
      ...(reported.bookedFor ? { bookedFor: reported.bookedFor, daysLeft: daysBetween(today, reported.bookedFor) } : {}),
    };
  }
  return { status: opts.studying ? "studying" : "not-started" };
}

/** Counts a cert as held when passed and not expired (expiring still counts). */
export function isHeld(view: CertStatusView): boolean {
  return view.status === "passed" || view.status === "expiring";
}
