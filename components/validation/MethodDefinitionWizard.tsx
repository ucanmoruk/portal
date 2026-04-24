"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ArrowLeft, Save, Beaker, CheckCircle2, AlertCircle, Monitor, Plus, Trash2, Users, UserPlus, Layers } from "lucide-react";
import { DEFAULT_PARAMETERS, MethodType, ValidationParameter } from "@/types/validation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Device {
    id: string;
    name: string;
    serialNo: string;
}

interface Person {
    id: string;
    name: string;
    role: string;
}

interface Component {
    id: string;
    name: string;
    casNo: string;
}

export function MethodDefinitionWizard() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [methodType, setMethodType] = useState<MethodType>('FULL_VALIDATION');
    const [parameters, setParameters] = useState<ValidationParameter[]>(DEFAULT_PARAMETERS);
    const [methodDetails, setMethodDetails] = useState({
        title: "",
        description: "",
    });

    // Device State
    const [devices, setDevices] = useState<Device[]>([]);
    const [newDevice, setNewDevice] = useState({ name: "", serialNo: "" });

    // Personnel State
    const [personnel, setPersonnel] = useState<Person[]>([]);
    const [newPerson, setNewPerson] = useState({ name: "", role: "" });

    // Components State
    const [components, setComponents] = useState<Component[]>([]);
    const [newComponent, setNewComponent] = useState({ name: "", casNo: "" });

    const handleTypeChange = (value: MethodType) => {
        setMethodType(value);

        // Auto-configure parameters based on type
        const updatedParams = DEFAULT_PARAMETERS.map(param => ({
            ...param,
            isEnabled: param.requiredFor.includes(value)
        }));
        setParameters(updatedParams);
    };

    const toggleParameter = (id: string) => {
        setParameters(parameters.map(p =>
            p.id === id ? { ...p, isEnabled: !p.isEnabled } : p
        ));
    };

    const addDevice = () => {
        if (newDevice.name && newDevice.serialNo) {
            setDevices([...devices, { ...newDevice, id: Math.random().toString(36).substr(2, 9) }]);
            setNewDevice({ name: "", serialNo: "" });
        }
    };

    const removeDevice = (id: string) => {
        setDevices(devices.filter(d => d.id !== id));
    };

    const addPerson = () => {
        if (newPerson.name && newPerson.role) {
            setPersonnel([...personnel, { ...newPerson, id: Math.random().toString(36).substr(2, 9) }]);
            setNewPerson({ name: "", role: "" });
        }
    };

    const removePerson = (id: string) => {
        setPersonnel(personnel.filter(p => p.id !== id));
    };

    const addComponent = () => {
        if (newComponent.name && newComponent.casNo) {
            setComponents([...components, { ...newComponent, id: Math.random().toString(36).substr(2, 9) }]);
            setNewComponent({ name: "", casNo: "" });
        }
    };

    const removeComponent = (id: string) => {
        setComponents(components.filter(c => c.id !== id));
    };

    const nextStep = () => setStep(step + 1);
    const prevStep = () => setStep(step - 1);

    const handleSave = () => {
        // In a real app, this would make an API call.
        // For now, we simulate success and redirect to dashboard.
        // alert("Validasyon Protokolü Başarıyla Oluşturuldu! (Simulasyon)");
        router.push("/validations/VAL-2023-001");
    };

    return (
        <div className="mx-auto max-w-4xl space-y-6">

            {/* Progress Indicator */}
            <div className="flex justify-between items-center mb-8">
                {[1, 2, 3, 4, 5, 6].map((s) => (
                    <div key={s} className="flex flex-col items-center">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${step >= s ? 'border-primary bg-primary text-primary-foreground' : 'border-muted text-muted-foreground'}`}>
                            {step > s ? <CheckCircle2 className="h-6 w-6" /> : s}
                        </div>
                        <span className={`mt-2 text-sm ${step >= s ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                            {s === 1 ? 'Tip' : s === 2 ? 'Param.' : s === 3 ? 'Cihaz' : s === 4 ? 'Yetkili' : s === 5 ? 'Komp.' : 'Onay'}
                        </span>
                    </div>
                ))}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>
                        {step === 1 && "Adım 1: Metot Tipini Belirleyin"}
                        {step === 2 && "Adım 2: Parametreleri Yapılandırın"}
                        {step === 3 && "Adım 3: Cihazları Tanımlayın"}
                        {step === 4 && "Adım 4: Yetkili Kişileri Ekleyin"}
                        {step === 5 && "Adım 5: Bileşenleri (Analitleri) Ekleyin"}
                        {step === 6 && "Adım 6: İncele ve Kaydet"}
                    </CardTitle>
                    <CardDescription>
                        {step === 1 && "Yapılacak validasyon çalışmasının tipini seçiniz."}
                        {step === 2 && "Bu çalışma için gerekli validasyon parametrelerini açıp kapatabilirsiniz."}
                        {step === 3 && "Kullanılacak cihaz ve ekipmanları listeye ekleyiniz."}
                        {step === 4 && "Bu çalışmada görev alacak personelleri tanımlayınız."}
                        {step === 5 && "Analiz edilecek bileşenleri (analitleri) listeye ekleyiniz."}
                        {step === 6 && "Çalışmayı başlatmadan önce konfigürasyonu gözden geçirin."}
                    </CardDescription>
                </CardHeader>

                <CardContent className="space-y-6">
                    {step === 1 && (
                        <div className="space-y-6">
                            <div className="space-y-3">
                                <Label htmlFor="method-title">Metot Başlığı</Label>
                                <Input
                                    id="method-title"
                                    placeholder="Örn: HPLC ile Kahvede Kafein Tayini"
                                    value={methodDetails.title}
                                    onChange={(e) => setMethodDetails({ ...methodDetails, title: e.target.value })}
                                />
                            </div>
                            <div className="space-y-3">
                                <Label htmlFor="method-desc">Açıklama</Label>
                                <Textarea
                                    id="method-desc"
                                    placeholder="Kapsam ve matriks hakkında kısa bilgi..."
                                    value={methodDetails.description}
                                    onChange={(e) => setMethodDetails({ ...methodDetails, description: e.target.value })}
                                />
                            </div>

                            <RadioGroup value={methodType} onValueChange={(v) => handleTypeChange(v as MethodType)} className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">

                                <Label htmlFor="full" className={`flex flex-col items-center justify-between rounded-md border-2 p-4 hover:bg-slate-50 cursor-pointer ${methodType === 'FULL_VALIDATION' ? 'border-blue-500 bg-blue-50/50' : 'border-muted'}`}>
                                    <RadioGroupItem value="FULL_VALIDATION" id="full" className="sr-only" />
                                    <Beaker className="mb-3 h-8 w-8 text-blue-500" />
                                    <div className="text-center">
                                        <div className="font-bold text-slate-900">Tam Validasyon</div>
                                        <div className="text-xs text-slate-500 mt-1">Yeni veya standart olmayan metotlar için</div>
                                    </div>
                                </Label>

                                <Label htmlFor="ver" className={`flex flex-col items-center justify-between rounded-md border-2 p-4 hover:bg-slate-50 cursor-pointer ${methodType === 'VERIFICATION' ? 'border-emerald-500 bg-emerald-50/50' : 'border-muted'}`}>
                                    <RadioGroupItem value="VERIFICATION" id="ver" className="sr-only" />
                                    <CheckCircle2 className="mb-3 h-8 w-8 text-emerald-500" />
                                    <div className="text-center">
                                        <div className="font-bold text-slate-900">Verifikasyon</div>
                                        <div className="text-xs text-slate-500 mt-1">Standart (ISO/TS) metotlar için</div>
                                    </div>
                                </Label>

                                <Label htmlFor="rev" className={`flex flex-col items-center justify-between rounded-md border-2 p-4 hover:bg-slate-50 cursor-pointer ${methodType === 'REVISION' ? 'border-orange-500 bg-orange-50/50' : 'border-muted'}`}>
                                    <RadioGroupItem value="REVISION" id="rev" className="sr-only" />
                                    <AlertCircle className="mb-3 h-8 w-8 text-orange-500" />
                                    <div className="text-center">
                                        <div className="font-bold text-slate-900">Revizyon / Değişiklik</div>
                                        <div className="text-xs text-slate-500 mt-1">Değişen koşullar için fark analizi</div>
                                    </div>
                                </Label>

                            </RadioGroup>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="grid gap-4">
                            <div className="bg-slate-50 p-4 rounded-md border text-sm text-slate-600 mb-4">
                                Seçiminize göre (<strong>{methodType === 'FULL_VALIDATION' ? 'Tam Validasyon' : methodType === 'VERIFICATION' ? 'Verifikasyon' : 'Revizyon'}</strong>), önerilen parametreler otomatik seçilmiştir. Aşağıdan düzenleyebilirsiniz.
                            </div>
                            {parameters.map((param) => (
                                <div key={param.id} className="flex items-center justify-between rounded-lg border p-4 shadow-sm">
                                    <div className="space-y-0.5">
                                        <Label className="text-base font-medium text-slate-900">{param.name}</Label>
                                        <p className="text-sm text-slate-500">
                                            {param.requiredFor.includes(methodType) ? 'Önerilen' : 'İsteğe Bağlı'}
                                        </p>
                                    </div>
                                    <Switch
                                        checked={param.isEnabled}
                                        onCheckedChange={() => toggleParameter(param.id)}
                                    />
                                </div>
                            ))}
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end bg-slate-50 p-4 rounded-lg border">
                                <div className="space-y-2">
                                    <Label>Cihaz Adı</Label>
                                    <Input
                                        placeholder="Örn: Agilent 1200 HPLC"
                                        value={newDevice.name}
                                        onChange={(e) => setNewDevice({ ...newDevice, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Seri No / ID</Label>
                                    <Input
                                        placeholder="Örn: TR-123456"
                                        value={newDevice.serialNo}
                                        onChange={(e) => setNewDevice({ ...newDevice, serialNo: e.target.value })}
                                    />
                                </div>
                                <Button onClick={addDevice} className="w-full md:w-auto">
                                    <Plus className="h-4 w-4 mr-2" /> Ekle
                                </Button>
                            </div>

                            <div className="border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Cihaz Adı</TableHead>
                                            <TableHead>Seri No / ID</TableHead>
                                            <TableHead className="w-[100px]">İşlem</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {devices.length > 0 ? (
                                            devices.map(device => (
                                                <TableRow key={device.id}>
                                                    <TableCell className="font-medium">{device.name}</TableCell>
                                                    <TableCell>{device.serialNo}</TableCell>
                                                    <TableCell>
                                                        <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => removeDevice(device.id)}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-center py-8 text-slate-500">
                                                    Henüz cihaz eklenmedi.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end bg-slate-50 p-4 rounded-lg border">
                                <div className="space-y-2">
                                    <Label>Ad Soyad</Label>
                                    <Input
                                        placeholder="Örn: Dr. Ayşe Yılmaz"
                                        value={newPerson.name}
                                        onChange={(e) => setNewPerson({ ...newPerson, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Görevi / Unvanı</Label>
                                    <Input
                                        placeholder="Örn: Analist"
                                        value={newPerson.role}
                                        onChange={(e) => setNewPerson({ ...newPerson, role: e.target.value })}
                                    />
                                </div>
                                <Button onClick={addPerson} className="w-full md:w-auto">
                                    <UserPlus className="h-4 w-4 mr-2" /> Ekle
                                </Button>
                            </div>

                            <div className="border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Ad Soyad</TableHead>
                                            <TableHead>Görevi</TableHead>
                                            <TableHead className="w-[100px]">İşlem</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {personnel.length > 0 ? (
                                            personnel.map(person => (
                                                <TableRow key={person.id}>
                                                    <TableCell className="font-medium">{person.name}</TableCell>
                                                    <TableCell>{person.role}</TableCell>
                                                    <TableCell>
                                                        <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => removePerson(person.id)}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-center py-8 text-slate-500">
                                                    Henüz personel eklenmedi.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}

                    {step === 5 && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end bg-slate-50 p-4 rounded-lg border">
                                <div className="space-y-2">
                                    <Label>Komponent Adı</Label>
                                    <Input
                                        placeholder="Örn: Kafein"
                                        value={newComponent.name}
                                        onChange={(e) => setNewComponent({ ...newComponent, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Cas No</Label>
                                    <Input
                                        placeholder="Örn: 58-08-2"
                                        value={newComponent.casNo}
                                        onChange={(e) => setNewComponent({ ...newComponent, casNo: e.target.value })}
                                    />
                                </div>
                                <Button onClick={addComponent} className="w-full md:w-auto">
                                    <Plus className="h-4 w-4 mr-2" /> Ekle
                                </Button>
                            </div>

                            <div className="border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Komponent Adı</TableHead>
                                            <TableHead>Cas No</TableHead>
                                            <TableHead className="w-[100px]">İşlem</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {components.length > 0 ? (
                                            components.map(comp => (
                                                <TableRow key={comp.id}>
                                                    <TableCell className="font-medium">{comp.name}</TableCell>
                                                    <TableCell>{comp.casNo}</TableCell>
                                                    <TableCell>
                                                        <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => removeComponent(comp.id)}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-center py-8 text-slate-500">
                                                    Henüz bilesen eklenmedi.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}

                    {step === 6 && (
                        <div className="space-y-6">
                            <div className="rounded-md border p-4 bg-slate-50">
                                <h3 className="font-semibold text-lg text-slate-900">{methodDetails.title || "Adsız Metot"}</h3>
                                <p className="text-slate-500 text-sm mt-1">{methodDetails.description || "Açıklama girilmedi."}</p>
                                <div className="mt-4 flex flex-wrap items-center gap-2">
                                    <Badge variant="outline" className="text-sm py-1 px-3 border-slate-300">
                                        {methodType === 'FULL_VALIDATION' ? 'Tam Validasyon' : methodType === 'VERIFICATION' ? 'Verifikasyon' : 'Revizyon'}
                                    </Badge>
                                    <Badge className="bg-blue-600 text-sm py-1 px-3">
                                        {parameters.filter(p => p.isEnabled).length} Parametre Seçili
                                    </Badge>
                                    <Badge className="bg-purple-600 text-sm py-1 px-3">
                                        {devices.length} Cihaz
                                    </Badge>
                                    <Badge className="bg-amber-600 text-sm py-1 px-3">
                                        {personnel.length} Yetkili
                                    </Badge>
                                    <Badge className="bg-cyan-600 text-sm py-1 px-3">
                                        {components.length} Bileşen
                                    </Badge>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <h4 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                                        <CheckCircle2 className="h-4 w-4 text-green-600" /> Seçilen Parametreler
                                    </h4>
                                    <div className="space-y-2">
                                        {parameters.filter(p => p.isEnabled).map(p => (
                                            <div key={p.id} className="text-sm text-slate-600 pl-6 border-l-2 border-slate-200">
                                                {p.name}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    <div>
                                        <h4 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                                            <Monitor className="h-4 w-4 text-purple-600" /> Seçilen Cihazlar
                                        </h4>
                                        <div className="space-y-2">
                                            {devices.length > 0 ? devices.map(d => (
                                                <div key={d.id} className="text-sm text-slate-600 pl-6 border-l-2 border-slate-200">
                                                    <span className="font-medium">{d.name}</span> <span className="text-slate-400">({d.serialNo})</span>
                                                </div>
                                            )) : (
                                                <p className="text-sm text-slate-400 italic">Cihaz seçilmedi.</p>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                                            <Users className="h-4 w-4 text-amber-600" /> Yetkili Kişiler
                                        </h4>
                                        <div className="space-y-2">
                                            {personnel.length > 0 ? personnel.map(p => (
                                                <div key={p.id} className="text-sm text-slate-600 pl-6 border-l-2 border-slate-200">
                                                    <span className="font-medium">{p.name}</span> <span className="text-slate-400">({p.role})</span>
                                                </div>
                                            )) : (
                                                <p className="text-sm text-slate-400 italic">Personel seçilmedi.</p>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                                            <Layers className="h-4 w-4 text-cyan-600" /> Bileşenler
                                        </h4>
                                        <div className="space-y-2">
                                            {components.length > 0 ? components.map(c => (
                                                <div key={c.id} className="text-sm text-slate-600 pl-6 border-l-2 border-slate-200">
                                                    <span className="font-medium">{c.name}</span> <span className="text-slate-400">(Cas: {c.casNo})</span>
                                                </div>
                                            )) : (
                                                <p className="text-sm text-slate-400 italic">Bileşen seçilmedi.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                </CardContent>
                <CardFooter className="flex justify-between">
                    <Button variant="outline" onClick={prevStep} disabled={step === 1}>
                        <ArrowLeft className="mr-2 h-4 w-4" /> Geri
                    </Button>

                    {step < 6 ? (
                        <Button onClick={nextStep} disabled={step === 1 && !methodDetails.title}>
                            İleri <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    ) : (
                        <Button className="bg-green-600 hover:bg-green-700" onClick={handleSave}>
                            <Save className="mr-2 h-4 w-4" /> Validasyon Protokolünü Oluştur
                        </Button>
                    )}
                </CardFooter>
            </Card>
        </div>
    );
}
