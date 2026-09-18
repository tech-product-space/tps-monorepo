"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PrivateAxios } from "@/gradient/helpers/PrivateAxios";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/gradient/components/ui/dialog";

import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";

import { useForm } from "react-hook-form";
import { AdminRole } from "@/gradient/types/admin";
import { adminService } from "@/gradient/services/adminService";

type FormData = {
    name: string;
};

type Props = {
    onCreated?: (role: AdminRole) => void;
};

export default function AddRoleDialog({ onCreated }: Props) {
    const [open, setOpen] = useState(false);

    const { register, handleSubmit, reset } = useForm<FormData>();

    const onSubmit = async (data: FormData) => {
        try {
            const res = await adminService.createRole(data);

            toast.success("Role created successfully");

            onCreated?.(res);

            reset();
            setOpen(false);
        } catch (err: any) {
            toast.error(err?.response?.data?.message || "Failed to create role");
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline">Add Role</Button>
            </DialogTrigger>

            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add Role</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <Input placeholder="Role name" {...register("name")} required />

                    <Button type="submit" className="w-full">
                        Create Role
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}