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

export const DEFAULT_PARAMETERS: ValidationParameter[] = [
    { id: 'selectivity', name: 'Seçicilik / Spesifiklik', isEnabled: false, requiredFor: ['FULL_VALIDATION'] },
    { id: 'lod', name: 'LOD (Tespit Limiti)', isEnabled: false, requiredFor: ['FULL_VALIDATION', 'VERIFICATION'] },
    { id: 'loq', name: 'LOQ (Tayin Limiti)', isEnabled: false, requiredFor: ['FULL_VALIDATION', 'VERIFICATION'] },
    { id: 'linearity', name: 'Doğrusallık (Linearity)', isEnabled: false, requiredFor: ['FULL_VALIDATION', 'VERIFICATION'] },
    { id: 'accuracy', name: 'Doğruluk (Accuracy)', isEnabled: false, requiredFor: ['FULL_VALIDATION', 'VERIFICATION'] },
    { id: 'precision_repeatability', name: 'Kesinlik (Tekrarlanabilirlik)', isEnabled: false, requiredFor: ['FULL_VALIDATION', 'VERIFICATION'] },
    { id: 'precision_reproducibility', name: 'Kesinlik (Tekrarüretilebilirlik)', isEnabled: false, requiredFor: ['FULL_VALIDATION', 'VERIFICATION'] },
    { id: 'trueness', name: 'Gerçeklik (Bias / Geri Kazanım)', isEnabled: false, requiredFor: ['FULL_VALIDATION', 'VERIFICATION'] },
    { id: 'robustness', name: 'Sağlamlık (Robustness)', isEnabled: false, requiredFor: ['FULL_VALIDATION'] },
];
