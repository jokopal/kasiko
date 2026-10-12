import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import type { Result } from '@/lib/result'

interface VoidDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  onConfirm: (reason: string) => Result
}

export function VoidDialog({ open, onOpenChange, title, description, onConfirm }: VoidDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Mounting the form only while open resets it every time. */}
        {open && (
          <VoidForm
            title={title}
            description={description}
            onConfirm={onConfirm}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function VoidForm({
  title,
  description,
  onConfirm,
  onDone,
}: Omit<VoidDialogProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    const result = onConfirm(reason)
    if (result.ok) onDone()
    else setError(result.error)
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <Field data-invalid={error !== null}>
        <FieldLabel htmlFor="void-reason">Alasan pembatalan</FieldLabel>
        <Textarea
          id="void-reason"
          autoFocus
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Contoh: salah pilih layanan"
          aria-invalid={error !== null}
        />
        {error && <FieldError>{error}</FieldError>}
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" size="lg" onClick={onDone}>
          Kembali
        </Button>
        <Button type="submit" variant="destructive" size="lg">
          Batalkan data
        </Button>
      </DialogFooter>
    </form>
  )
}
