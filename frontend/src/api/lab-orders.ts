/**
 * Lab orders API — tests ordered by doctors, with results (phase 3).
 */
import { apiGet, apiPost, apiPatch, apiDelete } from "./client";
import type { Envelope } from "./types";

export type LabOrderStatus = "ordered" | "in_progress" | "resulted" | "cancelled";

export type LabResultFlag = "low" | "normal" | "high" | "unknown" | null;

export interface LabOrder {
  id: number;
  patient: number;
  doctor: number;
  appointment: number | null;
  status: LabOrderStatus;
  test_name: string;
  unit: string;
  reference_min: number | null;
  reference_max: number | null;
  result_value: string;
  result_notes: string;
  notes: string;
  flag: LabResultFlag;
  ordered_by: string | null;
  resulted_at: string | null;
  ordered_at: string;
  created_at: string;
  updated_at: string;
}

export interface CreateLabOrderPayload {
  patient: number;
  appointment?: number | null;
  test_name: string;
  unit?: string;
  reference_min?: number | null;
  reference_max?: number | null;
  notes?: string;
}

export interface UpdateLabOrderPayload {
  status?: LabOrderStatus;
  result_value?: string;
  result_notes?: string;
  notes?: string;
}

/** GET /api/lab-orders/?patient=<id> — orders this doctor placed. */
export function listLabOrders(patientId?: number): Promise<Envelope<LabOrder[]>> {
  const params = patientId ? `?patient=${patientId}` : "";
  return apiGet<LabOrder[]>(`/lab-orders/${params}`);
}

/** GET /api/lab-orders/mine/ — the signed-in patient's orders and results. */
export function myLabOrders(): Promise<Envelope<LabOrder[]>> {
  return apiGet<LabOrder[]>("/lab-orders/mine/");
}

/** POST /api/lab-orders/ — doctor orders a test. */
export function createLabOrder(payload: CreateLabOrderPayload): Promise<Envelope<LabOrder>> {
  return apiPost<LabOrder>("/lab-orders/", payload);
}

/** PATCH /api/lab-orders/<id>/ — advance status or record the result. */
export function updateLabOrder(
  id: number,
  payload: UpdateLabOrderPayload
): Promise<Envelope<LabOrder>> {
  return apiPatch<LabOrder>(`/lab-orders/${id}/`, payload);
}

/** DELETE /api/lab-orders/<id>/ — cancel/remove an order. */
export async function deleteLabOrder(id: number): Promise<void> {
  await apiDelete(`/lab-orders/${id}/`);
}
