import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Edit3, Plus, Check, X, LogOut } from "lucide-react";
import { createGroup, updateGroup, leaveGroup, setLocalMemberId, addVisitedGroup, getVisitedGroups, removeVisitedGroup, clearLocalMemberId, getLocalMemberId } from "../lib/api";
import { toast } from "sonner";

/**
 * Group title + dropdown menu:
 *  - Rename current group
 *  - Create a new group
 *  - Jump to another visited group
 */
export default function GroupMenu({ group, onRenamed }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(null); // null | "rename" | "create" | "leave"
  const [renameVal, setRenameVal] = useState(group.name);
  const [newName, setNewName] = useState("");
  const [newAuthor, setNewAuthor] = useState("");
  const [busy, setBusy] = useState(false);
  const [visited, setVisited] = useState(() => getVisitedGroups());
  const ref = useRef(null);

  useEffect(() => setRenameVal(group.name), [group.name, group.code]);
  useEffect(() => {
    if (open) setVisited(getVisitedGroups());
  }, [open]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) {
        setOpen(false);
        setMode(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const onRename = async (e) => {
    e?.preventDefault?.();
    const next = renameVal.trim();
    if (!next || next === group.name) {
      setMode(null);
      return;
    }
    setBusy(true);
    try {
      await updateGroup(group.code, { name: next });
      addVisitedGroup({ code: group.code, name: next });
      toast.success("Group renamed");
      onRenamed && onRenamed(next);
      setMode(null);
      setOpen(false);
    } catch {
      toast.error("Could not rename");
    } finally {
      setBusy(false);
    }
  };

  const onCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !newAuthor.trim()) return toast.error("Fill both fields");
    setBusy(true);
    try {
      const { group: g, member_id } = await createGroup(newName.trim(), newAuthor.trim());
      setLocalMemberId(g.code, member_id);
      addVisitedGroup({ code: g.code, name: g.name });
      toast.success(`"${g.name}" created`);
      setOpen(false);
      setMode(null);
      setNewName("");
      setNewAuthor("");
      nav(`/g/${g.code}`);
    } catch {
      toast.error("Could not create group");
    } finally {
      setBusy(false);
    }
  };

  const onLeave = async () => {
    const memberId = getLocalMemberId(group.code);
    if (!memberId) {
      // Not joined locally — just remove from visited list and navigate home
      removeVisitedGroup(group.code);
      toast.dismiss();
      toast.success("Removed from your groups");
      nav("/");
      return;
    }
    setBusy(true);
    try {
      const res = await leaveGroup(group.code, memberId);
      removeVisitedGroup(group.code);
      clearLocalMemberId(group.code);
      toast.dismiss();
      if (res.dissolved) {
        toast.success("You were the last member — group dissolved");
      } else {
        toast.success("You left the group");
      }
      nav("/");
    } catch {
      toast.error("Could not leave group");
    } finally {
      setBusy(false);
    }
  };

  const otherGroups = visited.filter((g) => g.code !== group.code);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          setOpen((v) => !v);
          setMode(null);
        }}
        className="flex items-center gap-2 group/title text-left"
        data-testid="group-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <h1
          className="font-heading font-black text-3xl sm:text-4xl tracking-tight underline-offset-4 group-hover/title:underline"
          data-testid="group-name"
        >
          {group.name}
        </h1>
        <ChevronDown
          className={`w-5 h-5 transition-transform ${open ? "rotate-180" : ""}`}
          style={{ color: "var(--ink-soft)" }}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-3 w-72 z-40 neo-card p-3"
          style={{ background: "var(--card)" }}
          data-testid="group-menu-dropdown"
          role="menu"
        >
          {mode === null && (
            <>
              <MenuItem
                icon={<Edit3 className="w-4 h-4" />}
                label="Rename this group"
                onClick={() => setMode("rename")}
                testId="menu-rename-btn"
              />
              <MenuItem
                icon={<Plus className="w-4 h-4" />}
                label="Create a new group"
                onClick={() => setMode("create")}
                testId="menu-create-btn"
              />
              <MenuItem
                icon={<LogOut className="w-4 h-4" />}
                label="Leave this group"
                onClick={() => setMode("leave")}
                testId="menu-leave-btn"
                danger
              />
              <div
                className="my-2 h-px"
                style={{ background: "var(--ink)", opacity: 0.15 }}
              />
              <div className="label-caps px-2 py-1" style={{ color: "var(--ink-soft)" }}>
                Switch group
              </div>
              {otherGroups.length === 0 ? (
                <div className="px-2 py-2 text-xs" style={{ color: "var(--ink-mute)" }}>
                  You haven't joined any other groups yet.
                </div>
              ) : (
                <ul className="max-h-56 overflow-y-auto">
                  {otherGroups.map((g) => (
                    <li key={g.code}>
                      <button
                        onClick={() => {
                          setOpen(false);
                          nav(`/g/${g.code}`);
                        }}
                        className="w-full text-left px-2 py-2 rounded-lg hover:bg-[var(--pastel-mint)] flex items-center gap-2"
                        data-testid={`menu-switch-${g.code}`}
                      >
                        <span
                          className="w-7 h-7 rounded-lg border-2 grid place-items-center text-[10px] font-bold font-mono"
                          style={{ borderColor: "var(--ink)", background: "var(--pastel-yellow)" }}
                        >
                          {g.code.slice(0, 2)}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-bold truncate">{g.name}</span>
                          <span className="block text-[11px] font-mono tracking-widest" style={{ color: "var(--ink-mute)" }}>
                            {g.code}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {mode === "rename" && (
            <form onSubmit={onRename} data-testid="rename-form">
              <div className="label-caps mb-2">Rename group</div>
              <input
                autoFocus
                className="neo-input w-full mb-3"
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                data-testid="rename-input"
                maxLength={60}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode(null)}
                  className="neo-btn ghost text-sm flex-1 flex items-center justify-center gap-1"
                  data-testid="rename-cancel-btn"
                >
                  <X className="w-4 h-4" /> Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="neo-btn pastel text-sm flex-1 flex items-center justify-center gap-1"
                  data-testid="rename-save-btn"
                >
                  <Check className="w-4 h-4" /> Save
                </button>
              </div>
            </form>
          )}

          {mode === "create" && (
            <form onSubmit={onCreate} data-testid="create-new-form">
              <div className="label-caps mb-2">New group</div>
              <input
                autoFocus
                className="neo-input w-full mb-2"
                placeholder="Group name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                data-testid="new-group-name-input"
              />
              <input
                className="neo-input w-full mb-3"
                placeholder="Your display name"
                value={newAuthor}
                onChange={(e) => setNewAuthor(e.target.value)}
                data-testid="new-group-author-input"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode(null)}
                  className="neo-btn ghost text-sm flex-1"
                  data-testid="create-cancel-btn"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="neo-btn text-sm flex-1"
                  data-testid="create-submit-btn"
                >
                  {busy ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          )}

          {mode === "leave" && (
            <div data-testid="leave-confirm">
              <div className="label-caps mb-2 text-red-700">Leave this group?</div>
              <p className="text-sm mb-3" style={{ color: "var(--ink-soft)" }}>
                You'll leave "<span className="font-bold">{group.name}</span>"
                and your schedule entries will be removed. If you're the last
                member, the group will be automatically dissolved.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode(null)}
                  className="neo-btn ghost text-sm flex-1"
                  data-testid="leave-cancel-btn"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onLeave}
                  disabled={busy}
                  className="neo-btn text-sm flex-1 flex items-center justify-center gap-1"
                  style={{ background: "#E74C3C", color: "white", borderColor: "#0f172a" }}
                  data-testid="leave-confirm-btn"
                >
                  <LogOut className="w-4 h-4" /> {busy ? "Leaving..." : "Leave"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, testId, danger = false }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm font-medium ${
        danger
          ? "text-red-700 hover:bg-red-50"
          : "hover:bg-[var(--pastel-mint)]"
      }`}
      role="menuitem"
    >
      <span
        className="w-7 h-7 rounded-full border-2 grid place-items-center"
        style={{
          borderColor: danger ? "#E74C3C" : "var(--ink)",
          background: "var(--card)",
        }}
      >
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}
