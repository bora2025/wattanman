"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import Sidebar from "../../../components/Sidebar";
import AuthGuard from "../../../components/AuthGuard";
import { adminNav } from "../../../lib/admin-nav";
import { apiFetch } from "../../../lib/api";
import { useAccentColor } from "../../../lib/appearance/accentColor";

interface Person {
  id: string;
  name: string;
  phone?: string | null;
}
interface Bus {
  id: string;
  name: string;
  plateNumber: string;
  capacity: number;
  status: string;
  driver: Person | null;
  assistant: Person | null;
  route: { id: string; name: string } | null;
}
interface Route {
  id: string;
  name: string;
  description: string | null;
  status: string;
  direction: string;
  stops: Stop[];
}
interface Stop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  order: number;
  pickupTime?: string | null;
  dropoffTime?: string | null;
}
interface StudentOption {
  id: string;
  studentNumber: string | null;
  user: { name: string };
  class: { name: string } | null;
}
interface Options {
  students: StudentOption[];
  staff: Array<Person & { role: string }>;
}
interface Assignment {
  id: string;
  status: string;
  direction: string;
  handoffPolicy: string;
  student: { user: { name: string }; class: { name: string } | null };
  bus: Pick<Bus, "id" | "name" | "plateNumber"> | null;
  route: Pick<Route, "id" | "name">;
  pickupStop: Stop | null;
  dropoffStop: Stop | null;
}
interface Schedule {
  id: string;
  name: string;
  direction: string;
  departureTime: string;
  weekdays: string[];
  status: string;
  route: Route;
  bus: Bus | null;
}

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  INACTIVE: "bg-slate-100 text-slate-600",
  MAINTENANCE: "bg-amber-100 text-amber-700",
};

export default function BusAdminPage() {
  const { accentColor } = useAccentColor();
  const [tab, setTab] = useState<"buses" | "routes" | "riders" | "schedules">(
    "buses",
  );
  const [showBusForm, setShowBusForm] = useState(false);
  const [showRouteForm, setShowRouteForm] = useState(false);
  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const qc = useQueryClient();

  const {
    data: buses = [],
    isLoading: busLoading,
    isError: busError,
    refetch: refetchBuses,
  } = useQuery({
    queryKey: ["buses"],
    queryFn: async () => {
      const r = await apiFetch("/api/bus");
      if (!r.ok) throw new Error();
      return r.json() as Promise<Bus[]>;
    },
  });
  const {
    data: routes = [],
    isLoading: routeLoading,
    refetch: refetchRoutes,
  } = useQuery({
    queryKey: ["bus-routes"],
    queryFn: async () => {
      const r = await apiFetch("/api/bus/routes/all");
      if (!r.ok) throw new Error();
      return r.json() as Promise<Route[]>;
    },
  });
  const { data: options = { students: [], staff: [] } } = useQuery<Options>({
    queryKey: ["bus-admin-options"],
    queryFn: async () => {
      const r = await apiFetch("/api/bus/admin/options");
      if (!r.ok) throw new Error();
      return r.json();
    },
  });
  const { data: assignments = [] } = useQuery<Assignment[]>({
    queryKey: ["bus-assignments"],
    queryFn: async () => {
      const r = await apiFetch("/api/bus/assignments/all");
      if (!r.ok) throw new Error();
      return r.json();
    },
  });
  const { data: schedules = [] } = useQuery<Schedule[]>({
    queryKey: ["bus-schedules"],
    queryFn: async () => {
      const r = await apiFetch("/api/bus/schedules/all");
      if (!r.ok) throw new Error();
      return r.json();
    },
  });

  const deleteBus = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/bus/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["buses"] }),
  });
  const deleteRoute = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/bus/routes/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bus-routes"] }),
  });
  const remove = useMutation({
    mutationFn: ({
      kind,
      id,
    }: {
      kind: "assignments" | "schedules";
      id: string;
    }) => apiFetch(`/api/bus/${kind}/${id}`, { method: "DELETE" }),
    onSuccess: (_data, variables) =>
      qc.invalidateQueries({
        queryKey: [
          variables.kind === "assignments"
            ? "bus-assignments"
            : "bus-schedules",
        ],
      }),
  });

  return (
    <AuthGuard requiredRole="ADMIN">
      <div className="flex min-h-screen bg-slate-50 dark:bg-slate-800 pt-14 lg:pt-0 pb-[72px] lg:pb-0">
        <Sidebar
          title="Admin Panel"
          subtitle="Wattanman"
          navItems={adminNav}
          accentColor={accentColor}
        />
        <main className="flex-1 p-6 max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              🚌 School Bus Tracking
            </h1>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  tab === "buses"
                    ? setShowBusForm(true)
                    : tab === "routes"
                      ? setShowRouteForm(true)
                      : tab === "riders"
                        ? setShowAssignmentForm(true)
                        : setShowScheduleForm(true)
                }
                className="bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-sky-700"
              >
                + Add{" "}
                {tab === "buses"
                  ? "Bus"
                  : tab === "routes"
                    ? "Route"
                    : tab === "riders"
                      ? "Rider"
                      : "Schedule"}
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 mb-6">
            {(["buses", "routes", "riders", "schedules"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium capitalize ${tab === t ? "border-b-2 border-sky-600 text-sky-600" : "text-slate-500 hover:text-slate-700"}`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Buses Tab */}
          {tab === "buses" &&
            (busLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="bg-white dark:bg-slate-900 h-16 rounded-xl animate-pulse"
                  />
                ))}
              </div>
            ) : busError ? (
              <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl p-6 text-center">
                <p className="text-red-600 dark:text-red-400 mb-2">
                  Failed to load buses
                </p>
                <button
                  onClick={() => refetchBuses()}
                  className="text-sm text-red-500 dark:text-red-400 underline"
                >
                  Retry
                </button>
              </div>
            ) : buses.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl p-12 text-center shadow-sm">
                <p className="text-5xl mb-4">🚌</p>
                <p className="text-slate-400 dark:text-slate-500">
                  No buses configured
                </p>
                <button
                  onClick={() => setShowBusForm(true)}
                  className="mt-4 text-sky-600 dark:text-sky-400 text-sm underline"
                >
                  Add first bus
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {buses.map((bus) => (
                  <div
                    key={bus.id}
                    className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-4 border border-slate-100 dark:border-slate-800"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-100">
                          {bus.name}
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {bus.plateNumber}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                          Capacity: {bus.capacity} seats
                        </p>
                        {bus.route && (
                          <p className="text-xs text-sky-600 dark:text-sky-400 mt-1">
                            Route: {bus.route.name}
                          </p>
                        )}
                        <p className="text-xs text-slate-500 mt-1">
                          Driver: {bus.driver?.name ?? "Unassigned"}
                        </p>
                      </div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_COLOR[bus.status] ?? ""}`}
                      >
                        {bus.status}
                      </span>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => {
                          if (confirm("Delete bus?")) deleteBus.mutate(bus.id);
                        }}
                        className="text-xs text-red-500 dark:text-red-400 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}

          {/* Routes Tab */}
          {tab === "routes" &&
            (routeLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    className="bg-white dark:bg-slate-900 h-20 rounded-xl animate-pulse"
                  />
                ))}
              </div>
            ) : routes.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl p-12 text-center shadow-sm">
                <p className="text-slate-400 dark:text-slate-500">
                  No routes configured
                </p>
                <button
                  onClick={() => setShowRouteForm(true)}
                  className="mt-4 text-sky-600 dark:text-sky-400 text-sm underline"
                >
                  Add first route
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {routes.map((route) => (
                  <div
                    key={route.id}
                    className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-4 border border-slate-100 dark:border-slate-800"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-100">
                          {route.name}
                        </p>
                        {route.description && (
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {route.description}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          if (confirm("Delete route?"))
                            deleteRoute.mutate(route.id);
                        }}
                        className="text-xs text-red-500 dark:text-red-400 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {route.stops.map((stop, i) => (
                        <span
                          key={stop.id}
                          className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full text-slate-600 dark:text-slate-300"
                        >
                          {i + 1}. {stop.name}
                        </span>
                      ))}
                      {route.stops.length === 0 && (
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          No stops
                        </span>
                      )}
                    </div>
                    <StopForm
                      routeId={route.id}
                      onSuccess={() =>
                        qc.invalidateQueries({ queryKey: ["bus-routes"] })
                      }
                    />
                  </div>
                ))}
              </div>
            ))}

          {tab === "riders" && (
            <div className="space-y-3">
              {assignments.length === 0 ? (
                <Empty text="No students assigned to transport" />
              ) : (
                assignments.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex justify-between gap-4"
                  >
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-100">
                        {item.student.user.name}
                      </p>
                      <p className="text-sm text-slate-500">
                        {item.student.class?.name ?? "No class"} ·{" "}
                        {item.route.name} · {item.bus?.name ?? "Route bus"}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {item.pickupStop?.name ?? "No pickup"} →{" "}
                        {item.dropoffStop?.name ?? "No drop-off"} ·{" "}
                        {item.handoffPolicy.replaceAll("_", " ")}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        confirm("Remove rider assignment?") &&
                        remove.mutate({ kind: "assignments", id: item.id })
                      }
                      className="text-xs text-red-500"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "schedules" && (
            <div className="space-y-3">
              {schedules.length === 0 ? (
                <Empty text="No route schedules configured" />
              ) : (
                schedules.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex justify-between gap-4"
                  >
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-100">
                        {item.name} · {item.departureTime}
                      </p>
                      <p className="text-sm text-slate-500">
                        {item.route.name} · {item.direction} ·{" "}
                        {item.bus?.name ?? "No bus"}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {item.weekdays.join(", ")}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        confirm("Delete schedule?") &&
                        remove.mutate({ kind: "schedules", id: item.id })
                      }
                      className="text-xs text-red-500"
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </main>

        {showBusForm && (
          <BusFormModal
            routes={routes}
            onClose={() => setShowBusForm(false)}
            onSuccess={() => {
              setShowBusForm(false);
              qc.invalidateQueries({ queryKey: ["buses"] });
            }}
          />
        )}
        {showRouteForm && (
          <RouteFormModal
            onClose={() => setShowRouteForm(false)}
            onSuccess={() => {
              setShowRouteForm(false);
              qc.invalidateQueries({ queryKey: ["bus-routes"] });
            }}
          />
        )}
        {showAssignmentForm && (
          <AssignmentFormModal
            routes={routes}
            buses={buses}
            students={options.students}
            onClose={() => setShowAssignmentForm(false)}
            onSuccess={() => {
              setShowAssignmentForm(false);
              qc.invalidateQueries({ queryKey: ["bus-assignments"] });
            }}
          />
        )}
        {showScheduleForm && (
          <ScheduleFormModal
            routes={routes}
            buses={buses}
            onClose={() => setShowScheduleForm(false)}
            onSuccess={() => {
              setShowScheduleForm(false);
              qc.invalidateQueries({ queryKey: ["bus-schedules"] });
            }}
          />
        )}
      </div>
    </AuthGuard>
  );
}

function BusFormModal({
  routes,
  onClose,
  onSuccess,
}: {
  routes: Route[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm();
  const onSubmit = async (data: any) => {
    const res = await apiFetch("/api/bus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) onSuccess();
  };
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-bold mb-4">Add Bus</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <input
            {...register("name", { required: true })}
            placeholder="Bus name"
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          <input
            {...register("plateNumber", { required: true })}
            placeholder="Plate number"
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="number"
            {...register("capacity", { valueAsNumber: true })}
            placeholder="Capacity"
            defaultValue={40}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          <select
            {...register("routeId")}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">No route</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm bg-sky-600 text-white rounded-lg font-medium disabled:opacity-60"
            >
              {isSubmitting ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RouteFormModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm();
  const onSubmit = async (data: any) => {
    const res = await apiFetch("/api/bus/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) onSuccess();
  };
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-bold mb-4">Add Route</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <input
            {...register("name", { required: true })}
            placeholder="Route name"
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          <input
            {...register("description")}
            placeholder="Description (optional)"
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm bg-sky-600 text-white rounded-lg font-medium disabled:opacity-60"
            >
              {isSubmitting ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl p-12 text-center text-slate-400 shadow-sm">
      {text}
    </div>
  );
}

function StopForm({
  routeId,
  onSuccess,
}: {
  routeId: string;
  onSuccess: () => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm();
  const onSubmit = async (data: any) => {
    const response = await apiFetch(`/api/bus/routes/${routeId}/stops`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (response.ok) {
      reset();
      onSuccess();
    }
  };
  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800"
    >
      <input
        {...register("name", { required: true })}
        placeholder="Stop name"
        className="border rounded-lg px-2 py-1.5 text-xs"
      />
      <input
        type="number"
        step="any"
        {...register("latitude", { required: true, valueAsNumber: true })}
        placeholder="Latitude"
        className="border rounded-lg px-2 py-1.5 text-xs"
      />
      <input
        type="number"
        step="any"
        {...register("longitude", { required: true, valueAsNumber: true })}
        placeholder="Longitude"
        className="border rounded-lg px-2 py-1.5 text-xs"
      />
      <input
        type="time"
        {...register("pickupTime")}
        className="border rounded-lg px-2 py-1.5 text-xs"
      />
      <button
        disabled={isSubmitting}
        className="bg-slate-800 text-white rounded-lg px-3 py-1.5 text-xs disabled:opacity-50"
      >
        Add stop
      </button>
    </form>
  );
}

function AssignmentFormModal({
  routes,
  buses,
  students,
  onClose,
  onSuccess,
}: {
  routes: Route[];
  buses: Bus[];
  students: StudentOption[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { isSubmitting },
  } = useForm<{
    studentId: string;
    routeId: string;
    busId: string;
    pickupStopId: string;
    dropoffStopId: string;
    direction: string;
    handoffPolicy: string;
  }>({ defaultValues: { direction: "BOTH", handoffPolicy: "GUARDIAN" } });
  const route = routes.find((item) => item.id === watch("routeId"));
  const submit = async (data: any) => {
    const response = await apiFetch("/api/bus/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (response.ok) onSuccess();
  };
  return (
    <Modal title="Assign student" onClose={onClose}>
      <form onSubmit={handleSubmit(submit)} className="space-y-3">
        <select
          {...register("studentId", { required: true })}
          className="w-full border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Select student</option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.user.name} · {student.class?.name ?? "No class"}
            </option>
          ))}
        </select>
        <select
          {...register("routeId", { required: true })}
          className="w-full border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Select route</option>
          {routes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          {...register("busId")}
          className="w-full border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Use route bus</option>
          {buses.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.plateNumber}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <select
            {...register("pickupStopId")}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Pickup stop</option>
            {route?.stops.map((stop) => (
              <option key={stop.id} value={stop.id}>
                {stop.name}
              </option>
            ))}
          </select>
          <select
            {...register("dropoffStopId")}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Drop-off stop</option>
            {route?.stops.map((stop) => (
              <option key={stop.id} value={stop.id}>
                {stop.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select
            {...register("direction")}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="BOTH">Both directions</option>
            <option value="INBOUND">Inbound</option>
            <option value="OUTBOUND">Outbound</option>
          </select>
          <select
            {...register("handoffPolicy")}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="GUARDIAN">Guardian handoff</option>
            <option value="SELF_RELEASE">Self release</option>
            <option value="SCHOOL_STAFF">School staff</option>
          </select>
        </div>
        <ModalActions onClose={onClose} saving={isSubmitting} />
      </form>
    </Modal>
  );
}

function ScheduleFormModal({
  routes,
  buses,
  onClose,
  onSuccess,
}: {
  routes: Route[];
  buses: Bus[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<{
    name: string;
    routeId: string;
    busId: string;
    direction: string;
    departureTime: string;
    weekdays: string[];
    effectiveFrom: string;
  }>({
    defaultValues: {
      direction: "INBOUND",
      weekdays: ["MON", "TUE", "WED", "THU", "FRI"],
      effectiveFrom: new Date().toISOString().slice(0, 10),
    },
  });
  const submit = async (data: any) => {
    const response = await apiFetch("/api/bus/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        effectiveFrom: new Date(`${data.effectiveFrom}T00:00:00`).toISOString(),
      }),
    });
    if (response.ok) onSuccess();
  };
  return (
    <Modal title="Add route schedule" onClose={onClose}>
      <form onSubmit={handleSubmit(submit)} className="space-y-3">
        <input
          {...register("name", { required: true })}
          placeholder="Morning pickup"
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            {...register("routeId", { required: true })}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Select route</option>
            {routes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            {...register("busId")}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">No bus</option>
            {buses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <select
            {...register("direction")}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="INBOUND">Inbound</option>
            <option value="OUTBOUND">Outbound</option>
          </select>
          <input
            type="time"
            {...register("departureTime", { required: true })}
            className="border rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="date"
            {...register("effectiveFrom", { required: true })}
            className="border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((day) => (
            <label key={day}>
              <input
                type="checkbox"
                value={day}
                {...register("weekdays")}
                className="mr-1"
              />
              {day}
            </label>
          ))}
        </div>
        <ModalActions onClose={onClose} saving={isSubmitting} />
      </form>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-xl shadow-xl">
        <div className="flex justify-between mb-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({
  onClose,
  saving,
}: {
  onClose: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex gap-2 justify-end">
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2 text-sm border rounded-lg"
      >
        Cancel
      </button>
      <button
        disabled={saving}
        className="px-4 py-2 text-sm bg-sky-600 text-white rounded-lg font-medium disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}
