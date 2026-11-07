"use client";

import { useActionState, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { createComplaintAction, type NewComplaintState } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice, inputClass } from "@/components/ui";

/** Shrinks a phone photo to at most 1280 px and JPEG quality 0.75 before upload. */
async function compress(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("compress failed"))), "image/jpeg", 0.75));
}

export function NewComplaintForm() {
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, action] = useActionState<NewComplaintState, FormData>(async (prev, fd) => {
    fd.delete("photoPicker");
    if (photo) fd.set("photo", new File([photo.blob], "photo.jpg", { type: "image/jpeg" }));
    return createComplaintAction(prev, fd);
  }, {});

  return (
    <form action={action} className="space-y-5">
      <div>
        <label htmlFor="description" className="mb-1.5 block text-sm font-medium">
          What&apos;s wrong?
        </label>
        <textarea
          id="description"
          name="description"
          rows={5}
          required
          minLength={10}
          maxLength={1000}
          defaultValue={state.description}
          placeholder="e.g. Water leaking from the bathroom ceiling since this morning"
          className={inputClass}
        />
        <p className="mt-1.5 text-xs text-ink-3">English, हिंदी or मराठी. We sort it into the right team automatically.</p>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium">
          Photo <span className="font-normal text-ink-3">(optional)</span>
        </p>
        {photo ? (
          <div className="relative w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="Selected photo" className="h-32 rounded-xl border border-line object-cover" />
            <button
              type="button"
              aria-label="Remove photo"
              onClick={() => {
                URL.revokeObjectURL(photo.url);
                setPhoto(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
              className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full border border-line bg-surface shadow"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line-strong bg-surface text-sm text-ink-3 hover:bg-sunken">
            <Camera size={20} aria-hidden />
            Add a photo
            <input
              ref={fileRef}
              name="photoPicker"
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={async (e) => {
                setPhotoError(null);
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const blob = await compress(f);
                  setPhoto({ blob, url: URL.createObjectURL(blob) });
                } catch {
                  setPhotoError("Couldn't read that photo. Try another one.");
                }
              }}
            />
          </label>
        )}
        {photoError && <p className="mt-1.5 text-sm text-danger">{photoError}</p>}
      </div>

      {state.error && <Notice tone="danger">{state.error}</Notice>}

      <SubmitButton full size="lg" pendingLabel="Sending and sorting…">
        Send complaint
      </SubmitButton>

      <p className="text-xs leading-relaxed text-ink-3">
        Fire, gas, someone stuck in a lift or an electric shock is always sent straight to the duty manager as Critical. If someone is in danger,
        also call the security desk.
      </p>
    </form>
  );
}
