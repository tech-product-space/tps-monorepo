"use client"

import { useState } from "react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

import { externalLeadService } from "@/services/Leads/externalLeadService"
import { ILeadType } from "@/types/externalLead"

interface Props {
    open: boolean
    onOpenChange: (v: boolean) => void
    onCreated: (lead: ILeadType) => void
}

export default function CreateLeadTypeDialog({
    open,
    onOpenChange,
    onCreated
}: Props) {

    const [name, setName] = useState("")
    const [description, setDescription] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const create = async () => {

        if (!name.trim()) return

        try {

            setLoading(true)
            setError(null)

            const res = await externalLeadService.createLeadType({
                name,
                description: description || undefined
            })

            setName("")
            setDescription("")

            onCreated(res.leadType)
            onOpenChange(false)

        } catch (err: any) {

            if (err?.response?.status === 409) {
                setError("Lead type already exists")
            } else {
                setError("Failed to create lead type")
            }

        } finally {
            setLoading(false)
        }

    }

    const handleNameChange = (value: string) => {
        setName(value)
        if (error) setError(null)
    }

    return (

        <Dialog open={open} onOpenChange={onOpenChange}>

            <DialogContent className="w-full sm:max-w-[420px] min-h-[300px] flex flex-col">

                <DialogHeader>
                    <DialogTitle>Create Lead Type</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 flex-1">

                    <div className="space-y-1">

                        <Input
                            placeholder="Lead type name"
                            value={name}
                            onChange={(e) => handleNameChange(e.target.value)}
                        />

                        {error && (
                            <p className="text-sm text-red-500">
                                {error}
                            </p>
                        )}

                    </div>

                    <Textarea
                        placeholder="Description (optional)"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                    />

                </div>

                <Button
                    onClick={create}
                    disabled={loading || !name.trim()}
                    className="mt-4"
                >
                    {loading ? "Creating..." : "Create"}
                </Button>

            </DialogContent>

        </Dialog>

    )

}