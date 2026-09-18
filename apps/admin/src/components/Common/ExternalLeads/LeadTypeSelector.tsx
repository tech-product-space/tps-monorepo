"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Command, CommandGroup, CommandItem, CommandList, CommandInput } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check, Plus } from "lucide-react"
import CreateLeadTypeDialog from "./CreateLeadTypeDialog"
import { ILeadType } from "@/types/externalLead"

interface Props {
    types: ILeadType[]
    value: string[]
    onChange: (ids: string[]) => void
    onTypeCreated: (data: ILeadType) => void;
    buttonText?: string;
}

export default function LeadTypeSelector({ types, value, onChange, onTypeCreated, buttonText = "Select Type" }: Props) {
    const [open, setOpen] = useState(false)
    const [createOpen, setCreateOpen] = useState(false)

    const toggleType = (id: string) => {

        if (value.includes(id)) {
            onChange(value.filter(v => v !== id))
        } else {
            onChange([...value, id])
        }

    }

    return (

        <div className="flex flex-wrap gap-2">

            {types
                .filter(t => value.includes(t.id))
                .map(t => (
                    <Badge key={t.id}>
                        {t.name}
                    </Badge>
                ))}

            <Popover open={open} onOpenChange={setOpen}>

                <PopoverTrigger asChild>

                    <Button size="sm" variant="outline">
                        {buttonText}
                    </Button>

                </PopoverTrigger>

                <PopoverContent className="w-60 p-0">

                    <Command>

                        <CommandInput placeholder="Search type..." />

                        <CommandList>

                            <CommandGroup>

                                {types.map(type => (

                                    <CommandItem
                                        key={type.id}
                                        onSelect={() => toggleType(type.id)}
                                        className="flex items-center justify-between"
                                    >
                                        <span>{type.name}</span>

                                        {value.includes(type.id) && (
                                            <Check className="h-4 w-4 text-green-600" />
                                        )}
                                    </CommandItem>

                                ))}

                            </CommandGroup>

                            <CommandGroup>

                                <CommandItem onSelect={() => setCreateOpen(true)}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Create New Type
                                </CommandItem>

                            </CommandGroup>

                        </CommandList>

                    </Command>

                </PopoverContent>

            </Popover>

            <CreateLeadTypeDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                onCreated={onTypeCreated}
            />

        </div>

    )

}