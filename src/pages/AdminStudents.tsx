import { useState, useEffect, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, UserPlus, KeyRound, Loader2, Camera, Upload, X, Check, Send, CreditCard, ImagePlus, Users, Printer, Download, Pencil, ArrowRightLeft, Trash2 } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Textarea } from "@/components/ui/textarea";
import { generateStudentID, generateBulkStudentIDs } from "@/lib/generateStudentID";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import CameraCaptureDialog from "@/components/CameraCaptureDialog";
import PhoneCameraPairDialog from "@/components/PhoneCameraPairDialog";
import { Smartphone } from "lucide-react";
import { useTimetable } from "@/context/TimetableContext";

interface Student {
  id: string;
  registration_number: string;
  first_name: string;
  last_name: string;
  form: string | null;
  stream: string | null;
  gender: string;
  status: string;
  balance: number;
  claimed: boolean;
  is_beginner: boolean;
  guardian_phone: string | null;
  guardian_name: string | null;
  total_fees: number;
  total_paid: number;
  computed_balance: number;
  payment_status: string;
}

interface ExtractedStudent {
  first_name: string;
  last_name: string;
  form: string;
  stream: string;
  guardian_name: string;
  guardian_phone: string;
  selected: boolean;
}

const AdminStudents = () => {
  const { toast } = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
  const [open, setOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignFromForm, setReassignFromForm] = useState("");
  const [reassignFromStream, setReassignFromStream] = useState("");
  const [reassignToForm, setReassignToForm] = useState("");
  const [reassignToStream, setReassignToStream] = useState("");
  const [reassignSubmitting, setReassignSubmitting] = useState(false);
  const [removeClassOpen, setRemoveClassOpen] = useState(false);
  const [removeClassForm, setRemoveClassForm] = useState("");
  const [removeClassStream, setRemoveClassStream] = useState("");
  const [removeConfirmText, setRemoveConfirmText] = useState("");
  const [removeSubmitting, setRemoveSubmitting] = useState(false);

  // Bulk class entry state
  const [bulkForm, setBulkForm] = useState("");
  const [bulkStream, setBulkStream] = useState("");
  const [bulkGender, setBulkGender] = useState("male");
  const [bulkIsBeginner, setBulkIsBeginner] = useState(true);
  const [bulkNames, setBulkNames] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkScanning, setBulkScanning] = useState(false);
  const [bulkCameraOpen, setBulkCameraOpen] = useState(false);
  const [bulkPhoneOpen, setBulkPhoneOpen] = useState(false);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);

  const processScannedImage = async (base64: string) => {
    setBulkScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("extract-students", {
        body: { imageBase64: base64 },
      });
      if (error || data?.error) {
        toast({ title: "Scan Failed", description: data?.error || "Could not process the image.", variant: "destructive" });
        return;
      }
      const names = (data.students || [])
        .map((s: any) => `${s.first_name || ""} ${s.last_name || ""}`.trim())
        .filter((n: string) => n.length > 0);
      if (names.length === 0) {
        toast({ title: "No Names Found", description: "Try a clearer photo.", variant: "destructive" });
        return;
      }
      setBulkNames((prev) => (prev.trim() ? prev.replace(/\s+$/, "") + "\n" : "") + names.join("\n"));
      toast({ title: "Scan Complete", description: `Added ${names.length} name(s) from the picture.` });
    } catch {
      toast({ title: "Error", description: "Failed to scan image.", variant: "destructive" });
    } finally {
      setBulkScanning(false);
    }
  };

  const handleBulkScanFromPicture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = (ev) => resolve(ev.target?.result as string);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      await processScannedImage(base64);
    } finally {
      if (bulkFileInputRef.current) bulkFileInputRef.current.value = "";
    }
  };
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Register form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [form, setForm] = useState("");
  const [stream, setStream] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [isBeginner, setIsBeginner] = useState(true);
  const [gender, setGender] = useState("male");

  // Pull live class definitions so any class edits made in Admin → Classes
  // appear here in registration as well.
  const { classes: schoolClasses } = useTimetable();
  const streamsForForm = (f: string): string[] => {
    const fn = parseInt(f);
    if (!fn) return [];
    const fromClasses = schoolClasses
      .filter((c) => c.form === fn)
      .map((c) => (fn >= 5 ? (c.learningArea || c.stream) : c.stream));
    const fallback = fn >= 5 ? ["Sciences", "Commercials", "Arts"] : ["G1", "G2", "G22", "Blue"];
    const merged = Array.from(new Set([...fromClasses, ...fallback])).filter(Boolean);
    return merged;
  };


  // Reset password form
  const [resetRegNumber, setResetRegNumber] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // Scan/OCR state
  const [scanning, setScanning] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [extractedStudents, setExtractedStudents] = useState<ExtractedStudent[]>([]);
  const [sendingNotification, setSendingNotification] = useState<string | null>(null);
  const [bulkRegistering, setBulkRegistering] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);
  const [studentPhotos, setStudentPhotos] = useState<Record<string, string>>({});
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoTargetId, setPhotoTargetId] = useState<string | null>(null);

  const generateRegNumber = (offset = 0) => {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const first = letters[Math.floor(Math.random() * 26)];
    const last = letters[Math.floor(Math.random() * 26)];
    const num = (students.length + 1 + offset).toString().padStart(4, "0");
    return `${first}${num}${last}`;
  };

  const fetchStudents = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-students", {
        body: { action: "list_students" },
      });
      if (error || data?.error) {
        console.error("Failed to fetch students:", data?.error || error);
        return;
      }
      setStudents(data.students || []);
    } catch (err) {
      console.error("Error fetching students:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  useEffect(() => {
    if (students.length === 0) return;
    const loadPhotos = async () => {
      const photos: Record<string, string> = {};
      for (const s of students) {
        const { data } = supabase.storage
          .from("student-photos")
          .getPublicUrl(`${s.registration_number}.jpg`);
        try {
          const res = await fetch(data.publicUrl, { method: "HEAD" });
          if (res.ok) photos[s.id] = data.publicUrl;
        } catch { /* no photo */ }
      }
      setStudentPhotos(photos);
    };
    loadPhotos();
  }, [students]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !photoTargetId) return;
    const student = students.find((s) => s.id === photoTargetId);
    if (!student) return;
    setUploadingPhoto(photoTargetId);
    try {
      const filePath = `${student.registration_number}.jpg`;
      const { error } = await supabase.storage
        .from("student-photos")
        .upload(filePath, file, { upsert: true, contentType: file.type });
      if (error) {
        toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
        return;
      }
      const { data } = supabase.storage.from("student-photos").getPublicUrl(filePath);
      setStudentPhotos((prev) => ({ ...prev, [photoTargetId]: data.publicUrl + "?t=" + Date.now() }));
      toast({ title: "Photo Uploaded", description: `Photo for ${student.first_name} uploaded.` });
    } catch {
      toast({ title: "Error", description: "Failed to upload photo.", variant: "destructive" });
    } finally {
      setUploadingPhoto(null);
      setPhotoTargetId(null);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const handleRegister = async () => {
    if (!firstName.trim() || !lastName.trim() || !form || !stream) {
      toast({ title: "Missing Fields", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }

    setSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("manage-students", {
        body: {
          action: "create_student",
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          form,
          stream,
          gender,
          guardianName: guardianName.trim(),
          guardianPhone: guardianPhone.trim(),
          isBeginner,
        },
      });

      if (error || data?.error) {
        toast({ title: "Registration Failed", description: data?.error || "Something went wrong.", variant: "destructive" });
        return;
      }

      const regNumber = data.student?.registrationNumber || "N/A";

      // Send notification to guardian if phone is provided
      if (guardianPhone.trim()) {
        try {
          await supabase.functions.invoke("send-notification", {
            body: {
              type: "registration",
              guardianPhone: guardianPhone.trim(),
              studentName: `${firstName.trim()} ${lastName.trim()}`,
              registrationNumber: regNumber,
            },
          });
          toast({
            title: "Student Pre-Registered & Notified",
            description: `${firstName} ${lastName} registered as ${regNumber}. Guardian notified via SMS/WhatsApp.`,
          });
        } catch {
          toast({
            title: "Student Pre-Registered",
            description: `${firstName} ${lastName} registered as ${regNumber}. Guardian notification failed.`,
          });
        }
      } else {
        toast({
          title: "Student Pre-Registered",
          description: `${firstName} ${lastName} registered as ${regNumber}.`,
        });
      }

      setFirstName("");
      setLastName("");
      setForm("");
      setStream("");
      setGuardianName("");
      setGuardianPhone("");
      setIsBeginner(true);
      setOpen(false);
      fetchStudents();
    } catch {
      toast({ title: "Error", description: "Failed to register student.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkClassRegister = async () => {
    if (!bulkForm || !bulkStream) {
      toast({ title: "Missing Class", description: "Select form and stream.", variant: "destructive" });
      return;
    }
    const lines = bulkNames
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*\d+[\).\s-]+/, "").trim()) // strip leading "1. " / "1) "
      .filter((l) => l.length > 0);
    if (lines.length === 0) {
      toast({ title: "No Names", description: "Paste at least one name.", variant: "destructive" });
      return;
    }

    setBulkSubmitting(true);
    let registered = 0;
    let failed = 0;

    for (const line of lines) {
      const parts = line.split(/\s+/);
      const firstName = parts[0];
      const lastName = parts.slice(1).join(" ") || parts[0];
      try {
        const { data, error } = await supabase.functions.invoke("manage-students", {
          body: {
            action: "create_student",
            firstName,
            lastName,
            form: bulkForm,
            stream: bulkStream,
            gender: bulkGender,
            isBeginner: bulkIsBeginner,
          },
        });
        if (error || data?.error) failed++;
        else registered++;
      } catch {
        failed++;
      }
    }

    toast({
      title: "Bulk Class Entry Complete",
      description: `${registered} ${bulkGender === "male" ? "boys" : "girls"} registered to Form ${bulkForm} ${bulkStream}${failed ? `, ${failed} failed` : ""}.`,
    });

    setBulkSubmitting(false);
    setBulkNames("");
    setBulkOpen(false);
    fetchStudents();
  };

  const handleBulkReassign = async () => {
    if (!reassignFromForm || !reassignFromStream || !reassignToForm || !reassignToStream) {
      toast({ title: "Missing Fields", description: "Pick both source and destination class.", variant: "destructive" });
      return;
    }
    if (reassignFromForm === reassignToForm && reassignFromStream === reassignToStream) {
      toast({ title: "Same Class", description: "Source and destination are identical.", variant: "destructive" });
      return;
    }
    const matches = students.filter(s => (s.form || "") === reassignFromForm && (s.stream || "") === reassignFromStream);
    if (matches.length === 0) {
      toast({ title: "No Students", description: "No students found in the source class.", variant: "destructive" });
      return;
    }
    if (!confirm(`Move ${matches.length} student(s) from Form ${reassignFromForm} ${reassignFromStream} → Form ${reassignToForm} ${reassignToStream}?`)) return;

    setReassignSubmitting(true);
    const ids = matches.map(s => s.id);
    const { error } = await supabase
      .from("profiles")
      .update({ form: reassignToForm, stream: reassignToStream })
      .in("id", ids);
    setReassignSubmitting(false);

    if (error) {
      toast({ title: "Reassign Failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Class Reassigned", description: `${matches.length} student(s) moved to Form ${reassignToForm} ${reassignToStream}.` });
    setReassignOpen(false);
    setReassignFromForm(""); setReassignFromStream(""); setReassignToForm(""); setReassignToStream("");
    fetchStudents();
  };

  const handleRemoveClass = async () => {
    if (!removeClassForm || !removeClassStream) {
      toast({ title: "Missing Fields", description: "Pick the class to remove.", variant: "destructive" });
      return;
    }
    const matches = students.filter(s => (s.form || "") === removeClassForm && (s.stream || "") === removeClassStream);
    if (matches.length === 0) {
      toast({ title: "No Students", description: "No students in that class.", variant: "destructive" });
      return;
    }
    if (removeConfirmText.trim().toUpperCase() !== "DELETE") {
      toast({ title: "Confirmation Required", description: "Type DELETE to confirm.", variant: "destructive" });
      return;
    }
    if (!confirm(`PERMANENTLY DELETE ${matches.length} student(s) from Form ${removeClassForm} ${removeClassStream}? This cannot be undone.`)) return;

    setRemoveSubmitting(true);
    const ids = matches.map(s => s.id);
    const { error } = await supabase.from("profiles").delete().in("id", ids);
    setRemoveSubmitting(false);

    if (error) {
      toast({ title: "Delete Failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Class Removed", description: `${matches.length} student(s) deleted from Form ${removeClassForm} ${removeClassStream}.` });
    setRemoveClassOpen(false);
    setRemoveClassForm(""); setRemoveClassStream(""); setRemoveConfirmText("");
    fetchStudents();
  };

  const handleDeleteStudent = async (s: { id: string; first_name: string; last_name: string; registration_number: string }) => {
    if (!confirm(`Permanently delete ${s.first_name} ${s.last_name} (${s.registration_number})?\n\nThis removes the student profile and cannot be undone.`)) return;
    const { error } = await supabase.from("profiles").delete().eq("id", s.id);
    if (error) {
      toast({ title: "Delete Failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Student Deleted", description: `${s.first_name} ${s.last_name} has been removed.` });
    fetchStudents();
  };

  const handleResetPassword = async () => {
    if (!resetRegNumber.trim() || !newPassword) {
      toast({ title: "Missing Fields", description: "Please enter the registration number and new password.", variant: "destructive" });
      return;
    }

    if (newPassword.length < 6) {
      toast({ title: "Weak Password", description: "Password must be at least 6 characters.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-students", {
        body: {
          action: "reset_password",
          registrationNumber: resetRegNumber.trim(),
          newPassword,
        },
      });

      if (error || data?.error) {
        toast({ title: "Reset Failed", description: data?.error || "Something went wrong.", variant: "destructive" });
        return;
      }

      toast({ title: "Password Reset", description: `Password for ${resetRegNumber} has been reset successfully.` });
      setResetRegNumber("");
      setNewPassword("");
      setResetOpen(false);
    } catch {
      toast({ title: "Error", description: "Failed to reset password.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const openEditStudent = (s: Student) => {
    setEditStudent(s);
    setEditFirstName(s.first_name || "");
    setEditLastName(s.last_name || "");
    setEditOpen(true);
  };

  const handleSaveEditStudent = async () => {
    if (!editStudent) return;
    const fn = editFirstName.trim();
    const ln = editLastName.trim();
    if (!fn || !ln) {
      toast({ title: "Missing Fields", description: "First and last name are required.", variant: "destructive" });
      return;
    }
    setEditSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ first_name: fn, last_name: ln })
        .eq("id", editStudent.id);
      if (error) {
        toast({ title: "Update Failed", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Student Updated", description: `Name changed to ${fn} ${ln}.` });
      setEditOpen(false);
      setEditStudent(null);
      fetchStudents();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to update.", variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };

  const handleSendNotification = async (student: Student) => {
    if (!student.guardian_phone) {
      toast({ title: "No Phone Number", description: "This student has no guardian phone number on file.", variant: "destructive" });
      return;
    }
    setSendingNotification(student.id);
    try {
      const { data, error } = await supabase.functions.invoke("send-notification", {
        body: {
          type: "registration",
          guardianPhone: student.guardian_phone,
          studentName: `${student.first_name} ${student.last_name}`,
          registrationNumber: student.registration_number,
        },
      });
      if (error || data?.error) {
        toast({ title: "Notification Failed", description: data?.error || data?.details?.message || "Could not send message.", variant: "destructive" });
      } else {
        toast({ title: "Notification Sent", description: `Message sent to ${student.guardian_phone} for ${student.first_name} ${student.last_name}.` });
      }
    } catch {
      toast({ title: "Error", description: "Failed to send notification.", variant: "destructive" });
    } finally {
      setSendingNotification(null);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Preview
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      setPreviewImage(base64);
      setScanOpen(true);
      setScanning(true);
      setExtractedStudents([]);

      try {
        const { data, error } = await supabase.functions.invoke("extract-students", {
          body: { imageBase64: base64 },
        });

        if (error || data?.error) {
          toast({ title: "Scan Failed", description: data?.error || "Could not process the image.", variant: "destructive" });
          setScanning(false);
          return;
        }

        const extracted = (data.students || []).map((s: any) => ({
          first_name: s.first_name || "",
          last_name: s.last_name || "",
          form: s.form || "",
          stream: s.stream || "",
          guardian_name: s.guardian_name || "",
          guardian_phone: s.guardian_phone || "",
          selected: true,
        }));

        setExtractedStudents(extracted);
        toast({ title: "Scan Complete", description: `Found ${extracted.length} student(s) in the image.` });
      } catch {
        toast({ title: "Error", description: "Failed to scan image.", variant: "destructive" });
      } finally {
        setScanning(false);
      }
    };
    reader.readAsDataURL(file);

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const toggleStudentSelection = (index: number) => {
    setExtractedStudents((prev) =>
      prev.map((s, i) => (i === index ? { ...s, selected: !s.selected } : s))
    );
  };

  const updateExtractedStudent = (index: number, field: keyof ExtractedStudent, value: string) => {
    setExtractedStudents((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  };

  const handleBulkRegister = async () => {
    const selected = extractedStudents.filter((s) => s.selected && s.first_name && s.last_name);
    if (selected.length === 0) {
      toast({ title: "No Students Selected", description: "Select at least one student to register.", variant: "destructive" });
      return;
    }

    setBulkRegistering(true);
    let registered = 0;
    let failed = 0;

    for (let i = 0; i < selected.length; i++) {
      const s = selected[i];
      const regNumber = generateRegNumber(i);

      try {
        const { data, error } = await supabase.functions.invoke("manage-students", {
          body: {
            action: "create_student",
            firstName: s.first_name.trim(),
            lastName: s.last_name.trim(),
            form: s.form || null,
            stream: s.stream || null,
            guardianName: s.guardian_name || null,
            guardianPhone: s.guardian_phone || null,
            registrationNumber: regNumber,
          },
        });

        if (error || data?.error) {
          failed++;
        } else {
          registered++;
          // Send notification if guardian phone exists
          if (s.guardian_phone) {
            try {
              await supabase.functions.invoke("send-notification", {
                body: {
                  type: "registration",
                  guardianPhone: s.guardian_phone,
                  studentName: `${s.first_name.trim()} ${s.last_name.trim()}`,
                  registrationNumber: regNumber,
                },
              });
            } catch {
              // Notification failed but registration succeeded
            }
          }
        }
      } catch {
        failed++;
      }
    }

    toast({
      title: "Bulk Registration Complete",
      description: `${registered} student(s) registered${failed > 0 ? `, ${failed} failed` : ""}.`,
    });

    setScanOpen(false);
    setExtractedStudents([]);
    setPreviewImage(null);
    fetchStudents();
    setBulkRegistering(false);
  };

  const baseFiltered = students.filter(
    (s) =>
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
      s.registration_number.toLowerCase().includes(search.toLowerCase())
  );

  // Detect duplicates across the full student list (by normalized name or reg number)
  const duplicateIds = (() => {
    const nameMap = new Map<string, string[]>();
    const regMap = new Map<string, string[]>();
    for (const s of students) {
      const nameKey = `${(s.first_name || "").trim().toLowerCase()} ${(s.last_name || "").trim().toLowerCase()}`.replace(/\s+/g, " ").trim();
      const regKey = (s.registration_number || "").trim().toUpperCase();
      if (nameKey) {
        if (!nameMap.has(nameKey)) nameMap.set(nameKey, []);
        nameMap.get(nameKey)!.push(s.id);
      }
      if (regKey) {
        if (!regMap.has(regKey)) regMap.set(regKey, []);
        regMap.get(regKey)!.push(s.id);
      }
    }
    const dups = new Set<string>();
    for (const ids of nameMap.values()) if (ids.length > 1) ids.forEach(i => dups.add(i));
    for (const ids of regMap.values()) if (ids.length > 1) ids.forEach(i => dups.add(i));
    return dups;
  })();

  const filtered = showDuplicatesOnly
    ? baseFiltered.filter(s => duplicateIds.has(s.id))
    : baseFiltered;

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="text-2xl font-bold text-foreground">Student Management</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" onClick={() => setResetOpen(true)}>
              <KeyRound size={16} /> Reset Password
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()}>
              <Camera size={16} /> Scan List
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setBulkOpen(true)}>
              <Users size={16} /> Bulk Class Entry
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setReassignOpen(true)}>
              <ArrowRightLeft size={16} /> Reassign Class
            </Button>
            <Button variant="destructive" className="gap-2" onClick={() => setRemoveClassOpen(true)}>
              <X size={16} /> Remove Class
            </Button>
            <Button variant="outline" className="gap-2" onClick={async () => {
              const year = new Date().getFullYear().toString();
              const ids = filtered.map(s => ({
                name: `${s.first_name} ${s.last_name}`,
                regNumber: s.registration_number,
                form: s.form || "—",
                stream: s.stream || "—",
                year,
                photoUrl: studentPhotos[s.id],
              }));
              if (ids.length === 0) {
                toast({ title: "No Students", description: "No students to generate IDs for.", variant: "destructive" });
                return;
              }
              await generateBulkStudentIDs(ids);
              toast({ title: "IDs Generated", description: `${ids.length} student ID card(s) saved as PDF.` });
            }}>
              <CreditCard size={16} /> Generate All IDs
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => {
              if (filtered.length === 0) {
                toast({ title: "No Students", description: "No students to print.", variant: "destructive" });
                return;
              }
              const rows = filtered
                .slice()
                .sort((a, b) => {
                  const f = (a.form || "").localeCompare(b.form || "");
                  if (f !== 0) return f;
                  const s = (a.stream || "").localeCompare(b.stream || "");
                  if (s !== 0) return s;
                  return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
                })
                .map((s, i) => `<tr><td>${i + 1}</td><td>${s.registration_number}</td><td>${`${s.last_name} ${s.first_name}`.toUpperCase()}</td><td>${s.form || "—"}</td><td>${s.stream || "—"}</td><td>${s.gender || "—"}</td><td>${s.guardian_phone || "—"}</td></tr>`)
                .join("");
              const html = `<!doctype html><html><head><title>Student List</title><style>
                @page { size: A4; margin: 12mm; }
                body { font-family: Arial, sans-serif; color: #000; }
                h1 { text-align: center; margin: 0 0 4px; font-size: 18px; }
                .meta { text-align: center; font-size: 11px; margin-bottom: 12px; color: #444; }
                table { width: 100%; border-collapse: collapse; font-size: 11px; }
                th, td { border: 1px solid #333; padding: 4px 6px; text-align: left; }
                th { background: #003366; color: #fff; }
                tr:nth-child(even) td { background: #f4f4f4; }
              </style></head><body>
                <h1>Progress Centre College — Student List</h1>
                <div class="meta">Total: ${filtered.length} · Printed: ${new Date().toLocaleString()}</div>
                <table><thead><tr><th>#</th><th>Reg No.</th><th>Name</th><th>Form</th><th>Stream</th><th>Gender</th><th>Guardian Phone</th></tr></thead><tbody>${rows}</tbody></table>
                <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),300);}</script>
              </body></html>`;
              const w = window.open("", "_blank");
              if (!w) { toast({ title: "Popup blocked", description: "Allow popups to print.", variant: "destructive" }); return; }
              w.document.write(html);
              w.document.close();
            }}>
              <Printer size={16} /> Print List
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => {
              if (filtered.length === 0) {
                toast({ title: "No Students", description: "No students to download.", variant: "destructive" });
                return;
              }
              // Group students by class (form + stream); generate a separate PDF per class
              const groups = new Map<string, typeof filtered>();
              for (const s of filtered) {
                const key = `Form ${s.form || "—"} ${s.stream || "—"}`;
                if (!groups.has(key)) groups.set(key, [] as any);
                (groups.get(key) as any).push(s);
              }
              const sortedKeys = Array.from(groups.keys()).sort();
              const dateStr = new Date().toISOString().split("T")[0];
              for (const key of sortedKeys) {
                const list = (groups.get(key) || []).slice().sort((a, b) =>
                  `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)
                );
                const doc = new jsPDF({ unit: "mm", format: "a4" });
                doc.setFontSize(14);
                doc.text("Progress Centre College — Student List", 105, 14, { align: "center" });
                doc.setFontSize(11);
                doc.text(`Class: ${key}`, 105, 21, { align: "center" });
                doc.setFontSize(9);
                doc.text(`Total: ${list.length} · Generated: ${new Date().toLocaleString()}`, 105, 27, { align: "center" });
                autoTable(doc, {
                  startY: 32,
                  head: [["#", "Reg No.", "Name", "Gender", "Guardian Phone"]],
                  body: list.map((s, i) => [i + 1, s.registration_number, `${s.last_name} ${s.first_name}`.toUpperCase(), s.gender || "—", s.guardian_phone || "—"]),
                  styles: { fontSize: 8 },
                  headStyles: { fillColor: [0, 51, 102], textColor: 255 },
                });
                const safeKey = key.replace(/[^a-z0-9]+/gi, "-");
                doc.save(`student-list-${safeKey}-${dateStr}.pdf`);
              }
              toast({ title: "Downloaded", description: `${sortedKeys.length} class PDF(s) exported.` });
            }}>
              <Download size={16} /> Download PDF
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => {
              if (filtered.length === 0) {
                toast({ title: "No Students", description: "No students to download.", variant: "destructive" });
                return;
              }
              const sorted = filtered.slice().sort((a, b) =>
                `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)
              );
              const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
              const header = ["#", "Reg No.", "First Name", "Last Name", "Form", "Stream", "Gender", "Guardian Name", "Guardian Phone"];
              const csv = [header.join(",")]
                .concat(sorted.map((s, i) => [i + 1, s.registration_number, (s.first_name || "").toUpperCase(), (s.last_name || "").toUpperCase(), s.form || "", s.stream || "", s.gender || "", s.guardian_name || "", s.guardian_phone || ""].map(esc).join(",")))
                .join("\n");
              const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `student-list-${new Date().toISOString().split("T")[0]}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}>
              <Download size={16} /> CSV
            </Button>
            <Button className="gap-2" onClick={() => setOpen(true)}>
              <UserPlus size={16} /> Register Student
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileSelect}
            />
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
            />
          </div>
        </div>

        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <CardTitle className="text-base">All Students ({filtered.length})</CardTitle>
              <Button
                variant={showDuplicatesOnly ? "default" : "outline"}
                size="sm"
                className="gap-2 sm:ml-2"
                onClick={() => setShowDuplicatesOnly(v => !v)}
                title="Show students with matching names or registration numbers"
              >
                <Users size={14} />
                {showDuplicatesOnly ? `Showing Duplicates (${duplicateIds.size})` : `Find Duplicates${duplicateIds.size > 0 ? ` (${duplicateIds.size})` : ""}`}
              </Button>
              <div className="relative sm:ml-auto w-full sm:w-64">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name or reg no..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-muted-foreground" size={24} />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary">
                    <TableHead>Reg No.</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Form</TableHead>
                    <TableHead>Stream</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Status</TableHead>
                     <TableHead>Balance</TableHead>
                     <TableHead>Fee Status</TableHead>
                     <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.registration_number}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{`${s.first_name} ${s.last_name}`.toUpperCase()}</span>
                          {duplicateIds.has(s.id) && (
                            <Badge variant="destructive" className="text-[10px]" title="Possible duplicate (matching name or registration number)">Duplicate</Badge>
                          )}
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => openEditStudent(s)} title="Edit name">
                            <Pencil size={12} />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>{s.form || "—"}</TableCell>
                      <TableCell>{s.stream || "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          <Badge variant={s.claimed ? "default" : "outline"} className={s.claimed ? "bg-success text-success-foreground" : ""}>
                            {s.claimed ? "Active" : "Pending"}
                          </Badge>
                          {s.is_beginner && (
                            <Badge variant="secondary" className="text-xs">Beginner</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={s.status === "Active" ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"}>
                          {s.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">
                          <span className="block font-medium">${s.total_fees} owed</span>
                          <span className="text-muted-foreground">${s.total_paid} paid</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={
                          s.payment_status === "Paid in Full" ? "bg-success text-success-foreground" :
                          s.payment_status === "Overpaid" ? "bg-primary text-primary-foreground" :
                          s.payment_status === "Outstanding" ? "bg-destructive text-destructive-foreground" :
                          ""
                        }>
                          {s.payment_status}
                          {s.payment_status === "Outstanding" && ` ($${Math.abs(s.computed_balance)})`}
                          {s.payment_status === "Overpaid" && ` (+$${s.computed_balance})`}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1"
                            disabled={uploadingPhoto === s.id}
                            onClick={() => {
                              setPhotoTargetId(s.id);
                              setTimeout(() => photoInputRef.current?.click(), 0);
                            }}
                            title={studentPhotos[s.id] ? "Change photo" : "Upload photo"}
                          >
                            {uploadingPhoto === s.id ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                            {studentPhotos[s.id] ? "📷" : "Photo"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1"
                            disabled={sendingNotification === s.id || !s.guardian_phone}
                            onClick={() => handleSendNotification(s)}
                            title={s.guardian_phone ? `Send to ${s.guardian_phone}` : "No phone number"}
                          >
                            {sendingNotification === s.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                            Notify
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1"
                            onClick={async () => {
                              await generateStudentID({
                                name: `${s.first_name} ${s.last_name}`,
                                regNumber: s.registration_number,
                                form: s.form || "—",
                                stream: s.stream || "—",
                                year: new Date().getFullYear().toString(),
                                photoUrl: studentPhotos[s.id],
                              });
                              toast({ title: "ID Generated", description: `ID card for ${s.first_name} saved.` });
                            }}
                             title="Generate Student ID Card"
                           >
                             <CreditCard size={14} /> ID
                           </Button>
                           <Button
                             variant="ghost"
                             size="sm"
                             className="gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                             onClick={() => handleDeleteStudent(s)}
                             title="Delete student"
                           >
                             <Trash2 size={14} /> Delete
                           </Button>
                         </div>
                       </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        No students found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Register Student Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pre-Register New Student</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>First Name *</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="John" />
              </div>
              <div className="space-y-2">
                <Label>Last Name *</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Form *</Label>
                <Select value={form} onValueChange={(v) => { setForm(v); setStream(""); }}>
                  <SelectTrigger><SelectValue placeholder="Select form" /></SelectTrigger>
                  <SelectContent>
                    {["1", "2", "3", "4", "5", "6"].map((f) => (
                      <SelectItem key={f} value={f}>Form {f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Stream *</Label>
                <Select value={stream} onValueChange={setStream}>
                  <SelectTrigger><SelectValue placeholder="Select stream" /></SelectTrigger>
                  <SelectContent>
                    {streamsForForm(form).map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Guardian Name</Label>
              <Input value={guardianName} onChange={(e) => setGuardianName(e.target.value)} placeholder="Parent/Guardian name" />
            </div>
            <div className="space-y-2">
              <Label>Guardian Phone</Label>
              <Input value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} placeholder="+254 7XX XXX XXX" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Gender *</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2 pt-7">
                <Checkbox id="isBeginner" checked={isBeginner} onCheckedChange={(v) => setIsBeginner(!!v)} />
                <Label htmlFor="isBeginner" className="text-sm font-normal">Beginner / New / Transferred</Label>
              </div>
            </div>
            <div className="rounded-md bg-secondary p-3">
              <p className="text-xs text-muted-foreground">Registration number will be auto-generated (e.g. K0023T)</p>
              <p className="text-xs text-muted-foreground mt-1">The number will be shown after registration. Share it with the student so they can set up their account.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleRegister} disabled={submitting}>
              {submitting ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
              Register Student
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Student Name Dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => { if (!editSaving) setEditOpen(v); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Student Name</DialogTitle>
            <DialogDescription>
              {editStudent ? `Reg No: ${editStudent.registration_number}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>First Name *</Label>
              <Input value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Last Name *</Label>
              <Input value={editLastName} onChange={(e) => setEditLastName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editSaving}>Cancel</Button>
            <Button onClick={handleSaveEditStudent} disabled={editSaving}>
              {editSaving ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Student Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Registration Number *</Label>
              <Input
                value={resetRegNumber}
                onChange={(e) => setResetRegNumber(e.target.value)}
                placeholder="e.g. K0023T"
              />
            </div>
            <div className="space-y-2">
              <Label>New Password *</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min 6 chars)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button onClick={handleResetPassword} disabled={submitting}>
              {submitting ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Scan Student List Dialog */}
      <Dialog open={scanOpen} onOpenChange={(v) => { if (!scanning && !bulkRegistering) setScanOpen(v); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Scan Student List</DialogTitle>
            <DialogDescription>
              AI will extract student names from your photo. Review and edit before registering.
            </DialogDescription>
          </DialogHeader>

          {previewImage && (
            <div className="rounded-md overflow-hidden border max-h-48">
              <img src={previewImage} alt="Uploaded student list" className="w-full object-contain max-h-48" />
            </div>
          )}

          {scanning && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="animate-spin text-primary" size={32} />
              <p className="text-sm text-muted-foreground">Reading student list... This may take a moment.</p>
            </div>
          )}

          {!scanning && extractedStudents.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Found {extractedStudents.length} student(s). Review and edit names — highlighted fields need attention:</p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {extractedStudents.map((s, i) => {
                  const missingFirst = !s.first_name.trim();
                  const missingLast = !s.last_name.trim();
                  return (
                    <div key={i} className={`flex items-start gap-3 p-3 rounded-md border ${(missingFirst || missingLast) && s.selected ? "border-destructive bg-destructive/5" : s.selected ? "bg-secondary/50" : "opacity-50"}`}>
                      <Checkbox
                        checked={s.selected}
                        onCheckedChange={() => toggleStudentSelection(i)}
                        className="mt-1"
                      />
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        <Input
                          value={s.first_name}
                          onChange={(e) => updateExtractedStudent(i, "first_name", e.target.value)}
                          placeholder="First name (required)"
                          className={`h-8 text-sm ${missingFirst ? "border-destructive ring-1 ring-destructive" : ""}`}
                        />
                        <Input
                          value={s.last_name}
                          onChange={(e) => updateExtractedStudent(i, "last_name", e.target.value)}
                          placeholder="Last name (required)"
                          className={`h-8 text-sm ${missingLast ? "border-destructive ring-1 ring-destructive" : ""}`}
                        />
                        <Select value={s.form} onValueChange={(v) => { updateExtractedStudent(i, "form", v); updateExtractedStudent(i, "stream", ""); }}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Form" /></SelectTrigger>
                          <SelectContent>
                            {["1", "2", "3", "4", "5", "6"].map((f) => (
                              <SelectItem key={f} value={f}>Form {f}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={s.stream} onValueChange={(v) => updateExtractedStudent(i, "stream", v)}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Stream" /></SelectTrigger>
                          <SelectContent>
                            {streamsForForm(s.form).map((st) => (
                              <SelectItem key={st} value={st}>{st}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive h-8 w-8 p-0 mt-0.5"
                        onClick={() => setExtractedStudents(prev => prev.filter((_, idx) => idx !== i))}
                        title="Remove student"
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setExtractedStudents(prev => [...prev, {
                  first_name: "",
                  last_name: "",
                  form: "",
                  stream: "",
                  guardian_name: "",
                  guardian_phone: "",
                  selected: true,
                }])}
              >
                <UserPlus size={14} /> Add Student Manually
              </Button>
            </div>
          )}

          {!scanning && extractedStudents.length === 0 && previewImage && (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">No students could be extracted. Try a clearer photo or add manually.</p>
              <div className="flex justify-center gap-2 mt-3">
                <Button variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={16} /> Try Another Photo
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => setExtractedStudents([{
                  first_name: "",
                  last_name: "",
                  form: "",
                  stream: "",
                  guardian_name: "",
                  guardian_phone: "",
                  selected: true,
                }])}>
                  <UserPlus size={16} /> Add Manually
                </Button>
              </div>
            </div>
          )}

          {extractedStudents.length > 0 && (
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
                <Upload size={16} /> Rescan
              </Button>
              <Button variant="outline" onClick={() => { setScanOpen(false); setExtractedStudents([]); setPreviewImage(null); }}>
                Cancel
              </Button>
              <Button onClick={handleBulkRegister} disabled={bulkRegistering} className="gap-2">
                {bulkRegistering ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Register {extractedStudents.filter((s) => s.selected).length} Student(s)
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
      {/* Bulk Class Entry Dialog */}
      <Dialog open={bulkOpen} onOpenChange={(v) => { if (!bulkSubmitting) setBulkOpen(v); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Class Entry</DialogTitle>
            <DialogDescription>
              Pick a class and gender, then paste names (one per line). Useful for entering boys or girls of a class from a printed list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Form *</Label>
                <Select value={bulkForm} onValueChange={(v) => { setBulkForm(v); setBulkStream(""); }}>
                  <SelectTrigger><SelectValue placeholder="Form" /></SelectTrigger>
                  <SelectContent>
                    {["1", "2", "3", "4", "5", "6"].map((f) => (
                      <SelectItem key={f} value={f}>Form {f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Stream *</Label>
                <Select value={bulkStream} onValueChange={setBulkStream}>
                  <SelectTrigger><SelectValue placeholder="Stream" /></SelectTrigger>
                  <SelectContent>
                    {streamsForForm(bulkForm).map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Gender *</Label>
                <Select value={bulkGender} onValueChange={setBulkGender}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Boys</SelectItem>
                    <SelectItem value="female">Girls</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="bulkBeginner" checked={bulkIsBeginner} onCheckedChange={(v) => setBulkIsBeginner(!!v)} />
              <Label htmlFor="bulkBeginner" className="text-sm font-normal">Mark all as Beginner / New / Transferred</Label>
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Names (one per line) *</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="gap-2"
                    disabled={bulkScanning}
                    onClick={() => setBulkCameraOpen(true)}
                  >
                    {bulkScanning ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                    Use Camera
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="gap-2"
                    disabled={bulkScanning}
                    onClick={() => setBulkPhoneOpen(true)}
                  >
                    <Smartphone size={14} />
                    Use Phone (QR)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={bulkScanning}
                    onClick={() => bulkFileInputRef.current?.click()}
                  >
                    <ImagePlus size={14} />
                    Upload Photo
                  </Button>
                  <input
                    ref={bulkFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleBulkScanFromPicture}
                  />
                </div>
              </div>
              <Textarea
                value={bulkNames}
                onChange={(e) => setBulkNames(e.target.value)}
                placeholder={"John Doe\nJane Smith\nPeter Moyo\n..."}
                rows={10}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {bulkNames.split(/\r?\n/).filter((l) => l.trim()).length} name(s) detected. Use "Scan from picture" to auto-fill from a photo of the class list. Numbering like "1." or "1)" is stripped. First word = first name, rest = last name.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={bulkSubmitting}>Cancel</Button>
            <Button onClick={handleBulkClassRegister} disabled={bulkSubmitting} className="gap-2">
              {bulkSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Register All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CameraCaptureDialog
        open={bulkCameraOpen}
        onOpenChange={setBulkCameraOpen}
        onCapture={processScannedImage}
        title="Scan Class List"
        description="Hold the device steady over the printed list and capture a clear, well-lit photo."
      />

      <PhoneCameraPairDialog
        open={bulkPhoneOpen}
        onOpenChange={setBulkPhoneOpen}
        onPhotos={async (photos) => {
          for (const p of photos) {
            await processScannedImage(p);
          }
        }}
        title="Scan Class List with Phone"
      />

      {/* Bulk Reassign Class Dialog */}
      <Dialog open={reassignOpen} onOpenChange={(v) => { if (!reassignSubmitting) setReassignOpen(v); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reassign Class</DialogTitle>
            <DialogDescription>
              Move every student from one Form/Stream to another. Use this to fix mis-labelled classes (e.g. G2.1 → G2).
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const combos = Array.from(new Set(students.map(s => `${s.form || ""}|${s.stream || ""}`)))
              .filter(k => k !== "|")
              .sort();
            const fromCount = students.filter(s => (s.form || "") === reassignFromForm && (s.stream || "") === reassignFromStream).length;
            return (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>From (existing class)</Label>
                  <Select value={`${reassignFromForm}|${reassignFromStream}`} onValueChange={(v) => { const [f, s] = v.split("|"); setReassignFromForm(f); setReassignFromStream(s); }}>
                    <SelectTrigger><SelectValue placeholder="Select source class" /></SelectTrigger>
                    <SelectContent>
                      {combos.map(k => {
                        const [f, s] = k.split("|");
                        const count = students.filter(st => (st.form || "") === f && (st.stream || "") === s).length;
                        return <SelectItem key={k} value={k}>Form {f} {s} ({count})</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>To Form</Label>
                    <Select value={reassignToForm} onValueChange={setReassignToForm}>
                      <SelectTrigger><SelectValue placeholder="Form" /></SelectTrigger>
                      <SelectContent>
                        {["1","2","3","4","5","6"].map(f => <SelectItem key={f} value={f}>Form {f}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>To Stream</Label>
                    <Input value={reassignToStream} onChange={(e) => setReassignToStream(e.target.value)} placeholder="e.g. G2, G22, Blue, Sciences" />
                    {reassignToForm && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {(parseInt(reassignToForm) >= 5 ? ["Sciences","Commercials","Arts"] : ["G1","G2","G22","Blue"]).map(s => (
                          <Button key={s} type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setReassignToStream(s)}>{s}</Button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {reassignFromForm && (
                  <p className="text-sm text-muted-foreground">
                    {fromCount} student(s) will be moved.
                  </p>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignOpen(false)} disabled={reassignSubmitting}>Cancel</Button>
            <Button onClick={handleBulkReassign} disabled={reassignSubmitting} className="gap-2">
              {reassignSubmitting && <Loader2 size={16} className="animate-spin" />}
              Move Students
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Class Dialog */}
      <Dialog open={removeClassOpen} onOpenChange={(v) => { if (!removeSubmitting) { setRemoveClassOpen(v); if (!v) { setRemoveClassForm(""); setRemoveClassStream(""); setRemoveConfirmText(""); } } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Remove All Students in a Class</DialogTitle>
            <DialogDescription>
              This permanently deletes every student profile in the chosen class. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const combos = Array.from(new Set(students.map(s => `${s.form || ""}|${s.stream || ""}`)))
              .filter(k => k !== "|")
              .sort();
            const count = students.filter(s => (s.form || "") === removeClassForm && (s.stream || "") === removeClassStream).length;
            return (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Class to remove</Label>
                  <Select value={`${removeClassForm}|${removeClassStream}`} onValueChange={(v) => { const [f, s] = v.split("|"); setRemoveClassForm(f); setRemoveClassStream(s); }}>
                    <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                    <SelectContent>
                      {combos.map(k => {
                        const [f, s] = k.split("|");
                        const c = students.filter(x => (x.form || "") === f && (x.stream || "") === s).length;
                        return <SelectItem key={k} value={k}>Form {f} {s} ({c})</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </div>
                {removeClassForm && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                    {count} student(s) will be <strong>permanently deleted</strong> from Form {removeClassForm} {removeClassStream}.
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Type <strong>DELETE</strong> to confirm</Label>
                  <Input value={removeConfirmText} onChange={(e) => setRemoveConfirmText(e.target.value)} placeholder="DELETE" />
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveClassOpen(false)} disabled={removeSubmitting}>Cancel</Button>
            <Button variant="destructive" onClick={handleRemoveClass} disabled={removeSubmitting} className="gap-2">
              {removeSubmitting && <Loader2 size={16} className="animate-spin" />}
              Remove Class
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AdminStudents;
