"use client";

import { useMemo, useState } from "react";
import { Calculator, FlaskConical, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ProtocolDevice {
    id: string;
    code?: string;
    name: string;
    serialNo?: string;
    intendedUse?: string;
    unit?: string;
    valueText?: string;
    uncertaintyComponent?: string;
    uncertaintyValue?: string | number | null;
    distributionType?: string;
}

interface ProtocolComponent {
    id: string;
    code?: string;
    name: string;
    casNo?: string;
    limit?: string;
    unit?: string;
    valueText?: string;
    uncertaintyComponent?: string;
    uncertaintyValue?: string | number | null;
    distributionType?: string;
}

interface SamplePreparationUncertaintyFormProps {
    devices: ProtocolDevice[];
    components: ProtocolComponent[];
    initialData?: Record<string, any>;
    onReportDataChange?: (data: any) => void;
}

type VolumeRows = Record<string, { value: string; uncertainty: string }>;
type ChemicalRows = Record<string, { purity: string; impurity: string }>;

const parseNumber = (value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === "") return Number.NaN;
    const parsed = Number(String(value).replace(",", "."));
    return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const formatNumber = (value: number) => Number.isFinite(value) ? value.toLocaleString("tr-TR", { maximumFractionDigits: 8 }) : "-";
const formatFactor = (value: number) => Number.isFinite(value) ? value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-";

const distributionFactor = (distribution: string | null | undefined) => {
    const normalized = String(distribution || "").toLocaleLowerCase("tr-TR");
    if (normalized.includes("normal")) return 2;
    return Math.sqrt(3);
};

const normalizeDistribution = (distribution: string | null | undefined) =>
    distribution || "Dikdörtgen";

const defaultValue = (value: unknown) => value === null || value === undefined ? "" : String(value);

const temperatureKey = (device: ProtocolDevice) => `${device.id || device.code}-temperature`;
const TEMPERATURE_FACTOR = 1.73;
const tableBorderStyle = { borderColor: "#d1d5db" };
const inputClassName = "h-8 w-24 rounded border border-slate-300 bg-slate-100 px-2 text-sm";

const calculateTemperatureUncertainty = (value: string) => {
    const parsedValue = parseNumber(value);
    return Number.isFinite(parsedValue) ? 2.1e-4 * 5 * parsedValue : Number.NaN;
};

const buildInitialVolumeRows = (devices: ProtocolDevice[], savedRows: VolumeRows = {}) => {
    const nextRows: VolumeRows = { ...savedRows };

    devices
        .filter(device => device.intendedUse === "Numune Hazırlama")
        .forEach(device => {
            const key = device.id || device.code || device.name;
            if (!nextRows[key]) {
                nextRows[key] = {
                    value: defaultValue(device.valueText),
                    uncertainty: defaultValue(device.uncertaintyValue),
                };
            }

            const tempKey = temperatureKey(device);
            if (!nextRows[tempKey]) {
                nextRows[tempKey] = {
                    value: defaultValue(device.valueText),
                    uncertainty: "",
                };
            }
        });

    return nextRows;
};

const buildInitialChemicalRows = (components: ProtocolComponent[], savedRows: ChemicalRows = {}) => {
    const nextRows: ChemicalRows = { ...savedRows };

    components
        .filter(component => component.code || component.casNo || component.name)
        .forEach(component => {
            const key = component.id || component.code || component.name;
            if (!nextRows[key]) {
                nextRows[key] = {
                    purity: defaultValue(component.valueText),
                    impurity: defaultValue(component.uncertaintyValue),
                };
            }
        });

    return nextRows;
};

export function SamplePreparationUncertaintyForm({
    devices,
    components,
    initialData = {},
    onReportDataChange,
}: SamplePreparationUncertaintyFormProps) {
    const preparationDevices = useMemo(
        () => devices.filter(device => device.intendedUse === "Numune Hazırlama"),
        [devices],
    );

    const standards = useMemo(
        () => components.filter(component => component.code || component.casNo || component.name),
        [components],
    );

    const [volumeRows, setVolumeRows] = useState<VolumeRows>(() => buildInitialVolumeRows(devices, initialData.volumeRows || {}));
    const [chemicalRows, setChemicalRows] = useState<ChemicalRows>(() => buildInitialChemicalRows(components, initialData.chemicalRows || {}));
    const [notes, setNotes] = useState(() => initialData.notes || "");
    const [calculatedAt, setCalculatedAt] = useState("");

    const getVolumeRow = (key: string, item?: ProtocolDevice) => volumeRows[key] || {
        value: defaultValue(item?.valueText),
        uncertainty: defaultValue(item?.uncertaintyValue),
    };

    const getTemperatureRow = (device: ProtocolDevice) => volumeRows[temperatureKey(device)] || {
        value: defaultValue(device.valueText),
        uncertainty: "",
    };

    const getChemicalRow = (key: string, item?: ProtocolComponent) => chemicalRows[key] || {
        purity: defaultValue(item?.valueText),
        impurity: defaultValue(item?.uncertaintyValue),
    };

    const updateVolumeRow = (key: string, field: "value" | "uncertainty", value: string) => {
        setVolumeRows(current => ({
            ...current,
            [key]: {
                ...(current[key] || { value: "", uncertainty: "" }),
                [field]: value,
            },
        }));
    };

    const updateChemicalRow = (key: string, field: "purity" | "impurity", value: string) => {
        setChemicalRows(current => ({
            ...current,
            [key]: {
                ...(current[key] || { purity: "", impurity: "" }),
                [field]: value,
            },
        }));
    };

    const calculateUx = (uncertainty: string, factor: number) => {
        const uncertaintyValue = parseNumber(uncertainty);
        return Number.isFinite(uncertaintyValue) ? uncertaintyValue / factor : Number.NaN;
    };

    const calculateRelative = (standardUncertainty: number, value: string) => {
        const parsedValue = parseNumber(value);
        return Number.isFinite(standardUncertainty) && Number.isFinite(parsedValue) && parsedValue !== 0
            ? standardUncertainty / parsedValue
            : Number.NaN;
    };

    const buildPayload = () => {
        const volumetric = preparationDevices.flatMap(device => {
            const key = device.id || device.code || device.name;
            const row = getVolumeRow(key, device);
            const factor = distributionFactor(device.distributionType);
            const ux = calculateUx(row.uncertainty, factor);
            const temperatureRow = getTemperatureRow(device);
            const temperatureFactor = TEMPERATURE_FACTOR;
            const temperatureUncertainty = calculateTemperatureUncertainty(temperatureRow.value);
            const temperatureUx = Number.isFinite(temperatureUncertainty) ? temperatureUncertainty / temperatureFactor : Number.NaN;

            return [
                {
                    key,
                    code: device.code || "-",
                    name: device.name,
                    unit: device.unit || "-",
                    uncertaintyComponent: device.uncertaintyComponent || "Belirsizlik",
                    distribution: normalizeDistribution(device.distributionType),
                    factor,
                    value: row.value,
                    uncertainty: row.uncertainty,
                    standardUncertainty: ux,
                    relativeStandardUncertainty: calculateRelative(ux, row.value),
                },
                {
                    key: temperatureKey(device),
                    code: device.code || "-",
                    name: `${device.name} - Sıcaklık`,
                    unit: device.unit || "-",
                    uncertaintyComponent: "Sıcaklık",
                    distribution: "Dikdörtgen",
                    factor: temperatureFactor,
                    value: temperatureRow.value,
                    uncertainty: Number.isFinite(temperatureUncertainty) ? String(temperatureUncertainty) : "",
                    standardUncertainty: temperatureUx,
                    relativeStandardUncertainty: calculateRelative(temperatureUx, temperatureRow.value),
                },
            ];
        });

        const chemicals = standards.map(component => {
            const key = component.id || component.code || component.name;
            const row = getChemicalRow(key, component);
            const factor = distributionFactor(component.distributionType);
            const ux = calculateUx(row.impurity, factor);

            return {
                key,
                code: component.code || "-",
                name: component.name,
                uncertaintyComponent: component.uncertaintyComponent || "Saflık / Sertifika",
                distribution: normalizeDistribution(component.distributionType),
                factor,
                purity: row.purity,
                impurity: row.impurity,
                standardUncertainty: ux,
                relativeStandardUncertainty: calculateRelative(ux, row.purity),
            };
        });

        return {
            notes,
            volumeRows: Object.fromEntries(volumetric.map(row => [row.key, {
                value: row.value,
                uncertainty: row.uncertainty,
            }])),
            chemicalRows: Object.fromEntries(chemicals.map(row => [row.key, {
                purity: row.purity,
                impurity: row.impurity,
            }])),
            volumetric,
            chemicals,
        };
    };

    const saveModule = () => {
        onReportDataChange?.({
            type: "SAMPLE_PREPARATION",
            component: "summary",
            data: buildPayload(),
        });
        alert("Numune hazırlama belirsizlik verileri kaydedildi.");
    };

    const calculateModule = () => {
        buildPayload();
        setCalculatedAt(new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }));
    };

    return (
        <div className="overflow-hidden rounded-[14px] border [border-color:var(--color-border-light)] bg-[var(--color-surface)]">
            <div
                className="flex flex-col gap-2 border-b [border-color:var(--color-border-light)] bg-[var(--color-surface-2)] sm:flex-row sm:items-center sm:justify-between"
                style={{ display: "flex", padding: "14px 16px" }}
            >
                <div className="flex min-w-0 items-center gap-2">
                    <FlaskConical className="h-5 w-5 shrink-0 text-blue-600" />
                    <div className="truncate text-[var(--color-text-primary)]" style={{ fontSize: ".95rem", fontWeight: 800 }}>
                        Numune Hazırlama Belirsizliği
                    </div>
                </div>
                <p className="text-left text-[0.78rem] leading-5 text-[var(--color-text-tertiary)] sm:max-w-[48%] sm:text-right">
                    Protokolde seçilen numune hazırlama ekipmanları ve standartlar üzerinden belirsizlik bileşenlerini hesaplayın.
                </p>
            </div>

            <div className="space-y-5" style={{ padding: "16px" }}>
                <section className="rounded-xl border border-slate-300 bg-[var(--color-bg)]" style={{ padding: "16px" }}>
                    <Label className="text-sm font-bold text-[var(--color-text-primary)]">Notlar / Açıklama</Label>
                    <Textarea
                        className="mt-2 min-h-20 resize-y border-slate-300 bg-slate-100"
                        style={{ padding: "8px" }}
                        placeholder="Numune hazırlama belirsizliği ile ilgili notlar..."
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                    />
                </section>

                <section className="rounded-xl border [border-color:var(--color-border-light)] bg-[var(--color-bg)]" style={{ padding: "16px" }}>
                    <div className="mb-3 flex items-center gap-2">
                        <Calculator className="h-4 w-4 text-blue-600" />
                        <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
                            Standart ve Örnek Hazırlamak İçin Kullanılan Hacimsel Malzemelerin ve Terazilerin Belirsizliği
                        </h3>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-slate-300 bg-white">
                        <Table>
                            <TableHeader>
                                <TableRow style={tableBorderStyle}>
                                    <TableHead style={tableBorderStyle}>Kod</TableHead>
                                    <TableHead style={tableBorderStyle}>Ad</TableHead>
                                    <TableHead style={tableBorderStyle}>Birim</TableHead>
                                    <TableHead style={tableBorderStyle}>Belirsizlik Bileşeni</TableHead>
                                    <TableHead style={tableBorderStyle}>Dağılım</TableHead>
                                    <TableHead style={tableBorderStyle}>Faktör</TableHead>
                                    <TableHead style={tableBorderStyle}>Değer</TableHead>
                                    <TableHead style={tableBorderStyle}>Belirsizlik</TableHead>
                                    <TableHead style={tableBorderStyle}>Standart Belirsizlik u(x)</TableHead>
                                    <TableHead style={tableBorderStyle}>Relatif Standart Belirsizlik ux/x</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {preparationDevices.length === 0 ? (
                                    <TableRow style={tableBorderStyle}>
                                        <TableCell colSpan={10} className="py-8 text-center text-sm text-slate-500">
                                            Protokolde seçilmiş Numune Hazırlama cihazı bulunamadı.
                                        </TableCell>
                                    </TableRow>
                                ) : preparationDevices.flatMap(device => {
                                    const key = device.id || device.code || device.name;
                                    const row = getVolumeRow(key, device);
                                    const factor = distributionFactor(device.distributionType);
                                    const ux = calculateUx(row.uncertainty, factor);
                                    const relative = calculateRelative(ux, row.value);
                                    const tempKey = temperatureKey(device);
                                    const tempRow = getTemperatureRow(device);
                                    const tempFactor = TEMPERATURE_FACTOR;
                                    const tempUncertainty = calculateTemperatureUncertainty(tempRow.value);
                                    const tempUx = Number.isFinite(tempUncertainty) ? tempUncertainty / tempFactor : Number.NaN;
                                    const tempRelative = calculateRelative(tempUx, tempRow.value);

                                    return [
                                        <TableRow key={key} style={tableBorderStyle}>
                                            <TableCell style={tableBorderStyle}>{device.code || "-"}</TableCell>
                                            <TableCell style={tableBorderStyle} className="font-medium">{device.name}</TableCell>
                                            <TableCell style={tableBorderStyle}>{device.unit || "-"}</TableCell>
                                            <TableCell style={tableBorderStyle}>{device.uncertaintyComponent || "Belirsizlik"}</TableCell>
                                            <TableCell style={tableBorderStyle}>{normalizeDistribution(device.distributionType)}</TableCell>
                                            <TableCell style={tableBorderStyle}>{formatFactor(factor)}</TableCell>
                                            <TableCell>
                                                <input className={inputClassName} value={row.value} onChange={event => updateVolumeRow(key, "value", event.target.value)} />
                                            </TableCell>
                                            <TableCell>
                                                <input className={inputClassName} value={row.uncertainty} onChange={event => updateVolumeRow(key, "uncertainty", event.target.value)} />
                                            </TableCell>
                                            <TableCell style={tableBorderStyle}>{formatNumber(ux)}</TableCell>
                                            <TableCell style={tableBorderStyle}>{formatNumber(relative)}</TableCell>
                                        </TableRow>,
                                        <TableRow key={tempKey} style={tableBorderStyle}>
                                            <TableCell style={tableBorderStyle}>{device.code || "-"}</TableCell>
                                            <TableCell style={tableBorderStyle} className="font-medium">{device.name}</TableCell>
                                            <TableCell style={tableBorderStyle}>{device.unit || "-"}</TableCell>
                                            <TableCell style={tableBorderStyle}>Sıcaklık</TableCell>
                                            <TableCell style={tableBorderStyle}>Dikdörtgen</TableCell>
                                            <TableCell style={tableBorderStyle}>{formatFactor(tempFactor)}</TableCell>
                                            <TableCell>
                                                <input className={inputClassName} value={tempRow.value} onChange={event => updateVolumeRow(tempKey, "value", event.target.value)} />
                                            </TableCell>
                                            <TableCell>
                                                <input className={`${inputClassName} bg-slate-200`} value={Number.isFinite(tempUncertainty) ? formatNumber(tempUncertainty) : ""} readOnly />
                                            </TableCell>
                                            <TableCell style={tableBorderStyle}>{formatNumber(tempUx)}</TableCell>
                                            <TableCell style={tableBorderStyle}>{formatNumber(tempRelative)}</TableCell>
                                        </TableRow>,
                                    ];
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </section>

                <section className="rounded-xl border [border-color:var(--color-border-light)] bg-[var(--color-bg)]" style={{ padding: "16px" }}>
                    <div className="mb-3 flex items-center gap-2">
                        <Calculator className="h-4 w-4 text-blue-600" />
                        <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
                            Standart ve Örnek Hazırlamak İçin Kullanılan Kimyasal Malzemelerin Belirsizliği
                        </h3>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-slate-300 bg-white">
                        <Table>
                            <TableHeader>
                                <TableRow style={tableBorderStyle}>
                                    <TableHead style={tableBorderStyle}>Kod</TableHead>
                                    <TableHead style={tableBorderStyle}>Kimyasal Adı</TableHead>
                                    <TableHead style={tableBorderStyle}>Belirsizlik Bileşeni</TableHead>
                                    <TableHead style={tableBorderStyle}>Dağılım</TableHead>
                                    <TableHead style={tableBorderStyle}>Faktör</TableHead>
                                    <TableHead style={tableBorderStyle}>Standart Saflığı</TableHead>
                                    <TableHead style={tableBorderStyle}>Safsızlık (± değer)</TableHead>
                                    <TableHead style={tableBorderStyle}>Standart Belirsizlik u(x)</TableHead>
                                    <TableHead style={tableBorderStyle}>Relatif Standart Belirsizlik ux/x</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {standards.length === 0 ? (
                                    <TableRow style={tableBorderStyle}>
                                        <TableCell colSpan={9} className="py-8 text-center text-sm text-slate-500">
                                            Protokolde seçilmiş Standart kaydı bulunamadı.
                                        </TableCell>
                                    </TableRow>
                                ) : standards.map(component => {
                                    const key = component.id || component.code || component.name;
                                    const row = getChemicalRow(key, component);
                                    const factor = distributionFactor(component.distributionType);
                                    const ux = calculateUx(row.impurity, factor);
                                    const relative = calculateRelative(ux, row.purity);

                                    return (
                                        <TableRow key={key} style={tableBorderStyle}>
                                            <TableCell style={tableBorderStyle}>{component.code || "-"}</TableCell>
                                            <TableCell style={tableBorderStyle} className="font-medium">{component.name}</TableCell>
                                            <TableCell style={tableBorderStyle}>{component.uncertaintyComponent || "Saflık / Sertifika"}</TableCell>
                                            <TableCell style={tableBorderStyle}>{normalizeDistribution(component.distributionType)}</TableCell>
                                            <TableCell style={tableBorderStyle}>{formatFactor(factor)}</TableCell>
                                            <TableCell>
                                                <input className={inputClassName} value={row.purity} onChange={event => updateChemicalRow(key, "purity", event.target.value)} />
                                            </TableCell>
                                            <TableCell>
                                                <input className={inputClassName} value={row.impurity} onChange={event => updateChemicalRow(key, "impurity", event.target.value)} />
                                            </TableCell>
                                            <TableCell style={tableBorderStyle}>{formatNumber(ux)}</TableCell>
                                            <TableCell style={tableBorderStyle}>{formatNumber(relative)}</TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </section>

                <div className="flex flex-col items-end gap-2 sm:flex-row sm:justify-end">
                    {calculatedAt && (
                        <span className="text-xs text-slate-500">Son hesaplama: {calculatedAt}</span>
                    )}
                    <Button className="bg-blue-600 hover:bg-blue-700" style={{ padding: "10px 16px" }} onClick={calculateModule}>
                        <Calculator className="mr-2 h-4 w-4" /> Hesapla
                    </Button>
                    <Button className="bg-green-600 hover:bg-green-700" style={{ padding: "10px 16px" }} onClick={saveModule}>
                        <Save className="mr-2 h-4 w-4" /> Kaydet
                    </Button>
                </div>
            </div>
        </div>
    );
}
