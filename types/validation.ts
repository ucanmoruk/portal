export type MethodType = 'FULL_VALIDATION' | 'VERIFICATION' | 'REVISION';

export interface ValidationParameter {
    id: string;
    name: string;
    isEnabled: boolean;
    requiredFor: MethodType[];
}

export interface MethodConfig {
    id: string;
    title: string;
    type: MethodType;
    description: string;
    parameters: ValidationParameter[];
    createdAt: string;
    updatedAt: string;
}

export const VALIDATION_PARAMETER_ORDER = [
    'selectivity',
    'linearity',
    'lod',
    'loq',
    'precision_repeatability',
    'trueness',
    'precision_reproducibility',
    'accuracy',
    'robustness',
];

export const sortValidationParameters = <T extends { id: string }>(parameters: T[]) =>
    [...parameters].sort((a, b) => {
        const aIndex = VALIDATION_PARAMETER_ORDER.indexOf(a.id);
        const bIndex = VALIDATION_PARAMETER_ORDER.indexOf(b.id);
        const normalizedA = aIndex === -1 ? VALIDATION_PARAMETER_ORDER.length : aIndex;
        const normalizedB = bIndex === -1 ? VALIDATION_PARAMETER_ORDER.length : bIndex;
        return normalizedA - normalizedB;
    });

export const DEFAULT_PARAMETERS: ValidationParameter[] = [
    { id: 'selectivity', name: 'Seçicilik / Spesifiklik', isEnabled: false, requiredFor: ['FULL_VALIDATION'] },
    { id: 'linearity', name: 'Doğrusallık (Linearity)', isEnabled: false, requiredFor: ['FULL_VALIDATION', 'VERIFICATION'] },
    { id: 'lod', name: 'LOD (Tespit Limiti) ve LOQ (Tayini Limiti)', isEnabled: false, requiredFor: ['FULL_VALIDATION', 'VERIFICATION'] },
    { id: 'precision_repeatability', name: 'Kesinlik (Tekrarlanabilirlik)', isEnabled: false, requiredFor: ['FULL_VALIDATION', 'VERIFICATION'] },
    { id: 'trueness', name: 'Gerçeklik (Bias / Geri Kazanım)', isEnabled: false, requiredFor: ['FULL_VALIDATION', 'VERIFICATION'] },
    { id: 'precision_reproducibility', name: 'Kesinlik (Tekrarüretilebilirlik)', isEnabled: false, requiredFor: ['FULL_VALIDATION', 'VERIFICATION'] },
    { id: 'accuracy', name: 'Doğruluk (Accuracy)', isEnabled: false, requiredFor: ['FULL_VALIDATION', 'VERIFICATION'] },
    { id: 'robustness', name: 'Sağlamlık (Robustness)', isEnabled: false, requiredFor: ['FULL_VALIDATION'] },
];
