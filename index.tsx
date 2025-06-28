import React, { useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import * as XLSX from 'xlsx';

interface NfeItem {
  'Chave': string;
  'Data Emissão': string;
  'Código Produto': string;
  'EAN': string;
  'Produto': string;
  'NCM': string;
  'CEST': string;
  'Ind. Escala': string;
  'CFOP': string;
  'Unidade Comercial': string;
  'Quantidade Comercial': string;
  'Valor Unitário Comercial': string;
  'Valor Produto': string;
  'EAN Tributável': string;
  'Unidade Tributável': string;
  'Quantidade Tributável': string;
  'Valor Unitário Tributável': string;
  'Indicador Total': string;
}

const INITIAL_ALLOWED_NCMS = [
    "25202", "2522", "2523", "2713", "2715", "28", "29", "31", "32", "37", "38", "39", "40", "41", "44", "4504", 
    "47", "48", "50", "51", "52", "53", "54", "55", "56", "58", "59", "60", "61", "62", "63", "64", "65050022", 
    "68", "69", "70", "72", "73", "74", "75", "76", "78", "79", "80", "81", "82", "83", "8484", "90049020", "90183", "902000", "94"
];

const App: React.FC = () => {
    const [files, setFiles] = useState<File[]>([]);
    const [data, setData] = useState<NfeItem[]>([]);
    const [errors, setErrors] = useState<{ file: string, message: string }[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [allowedNcms, setAllowedNcms] = useState<string[]>(INITIAL_ALLOWED_NCMS);

    const NFE_NS = 'http://www.portalfiscal.inf.br/nfe';

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFiles(Array.from(e.target.files));
        }
    };

    const handleDragOver = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            setFiles(Array.from(e.dataTransfer.files).filter(file => {
                const f = file as File;
                return f.type === 'text/xml' || f.name.toLowerCase().endsWith('.xml');
            }));
            e.dataTransfer.clearData();
        }
    }, []);

    const clearState = () => {
        setFiles([]);
        setData([]);
        setErrors([]);
        setProgress('');
    };

    const safeFindText = (element: Element | undefined | null, tagName: string): string => {
        if (!element) return '';
        const child = element.getElementsByTagNameNS(NFE_NS, tagName)[0];
        return child?.textContent?.trim() ?? '';
    };

    const convertDate = (dateStr: string): string => {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            return date.toLocaleString('pt-BR', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            }).replace(',', '');
        } catch {
            return dateStr;
        }
    };
    
    const handleAllowedNcmFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            const ncmList = text.split(/[\n,]/).map(ncm => ncm.trim()).filter(Boolean);
            setAllowedNcms(ncmList);
        };
        reader.readAsText(file);
    };

    const handleAllowedNcmsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const ncmList = e.target.value.split(',').map(ncm => ncm.trim()).filter(Boolean);
        setAllowedNcms(ncmList);
    };

    const processFiles = async () => {
        setIsLoading(true);
        setData([]);
        setErrors([]);
        let allItems: NfeItem[] = [];
        let fileErrors: { file: string, message: string }[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            setProgress(`Processando ${i + 1} de ${files.length}: ${file.name}`);
            try {
                const content = await file.text();
                let sanitizedContent = content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
                if (sanitizedContent.startsWith('\uFEFF')) {
                    sanitizedContent = sanitizedContent.substring(1);
                }

                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(sanitizedContent, "application/xml");
                
                const parseError = xmlDoc.querySelector('parsererror');
                if (parseError) {
                    throw new Error(`Erro de parse do XML: ${parseError.textContent}`);
                }

                const infNFe = xmlDoc.getElementsByTagNameNS(NFE_NS, 'infNFe')[0];
                if (!infNFe) {
                     throw new Error('Tag <infNFe> não encontrada.');
                }

                const chave = infNFe.getAttribute('Id')?.replace('NFe', '') ?? 'N/A';
                const dhEmi = safeFindText(infNFe.getElementsByTagNameNS(NFE_NS, 'ide')[0], 'dhEmi');
                const dataEmissao = convertDate(dhEmi);

                const detElements = Array.from(infNFe.getElementsByTagNameNS(NFE_NS, 'det'));
                for (const det of detElements) {
                    const prod = det.getElementsByTagNameNS(NFE_NS, 'prod')[0];
                    if (prod) {
                        const item: NfeItem = {
                            'Chave': chave,
                            'Data Emissão': dataEmissao,
                            'Código Produto': safeFindText(prod, 'cProd'),
                            'EAN': safeFindText(prod, 'cEAN'),
                            'Produto': safeFindText(prod, 'xProd'),
                            'NCM': safeFindText(prod, 'NCM'),
                            'CEST': safeFindText(prod, 'CEST'),
                            'Ind. Escala': safeFindText(prod, 'indEscala'),
                            'CFOP': safeFindText(prod, 'CFOP'),
                            'Unidade Comercial': safeFindText(prod, 'uCom'),
                            'Quantidade Comercial': safeFindText(prod, 'qCom'),
                            'Valor Unitário Comercial': safeFindText(prod, 'vUnCom'),
                            'Valor Produto': safeFindText(prod, 'vProd'),
                            'EAN Tributável': safeFindText(prod, 'cEANTrib'),
                            'Unidade Tributável': safeFindText(prod, 'uTrib'),
                            'Quantidade Tributável': safeFindText(prod, 'qTrib'),
                            'Valor Unitário Tributável': safeFindText(prod, 'vUnTrib'),
                            'Indicador Total': safeFindText(prod, 'indTot'),
                        };
                        allItems.push(item);
                    }
                }
            } catch (e: any) {
                fileErrors.push({ file: file.name, message: e.message });
            }
        }
        
        setData(allItems);
        setErrors(fileErrors);
        setProgress(`Processamento concluído. ${allItems.length} itens encontrados.`);
        setIsLoading(false);
    };
    
    const generateAndDownloadXLSX = (items: NfeItem[], filename: string) => {
        if (items.length === 0) {
            setProgress("Não há dados para exportar.");
            return;
        }

        const worksheet = XLSX.utils.json_to_sheet(items);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Itens');
        
        XLSX.writeFile(workbook, filename);
    };

    const downloadFilteredXLSX = () => {
        const allowedPrefixes = allowedNcms;
        const ncmAceito = (ncm: string): boolean => {
            if (!ncm) return false;
            return allowedPrefixes.some((prefix: string) => ncm.startsWith(prefix));
        };
        const filteredData = data.filter((item: NfeItem) => ncmAceito(item['NCM']));
        generateAndDownloadXLSX(filteredData, 'itens_nfe_filtrado_NCM.xlsx');
    };

    return (
        <div className="container">
            <header>
                <h1>Processador de XML de NF-e</h1>
                <p>Faça o upload dos seus arquivos XML para extrair os itens e exportar como XLSX.</p>
            </header>

            <label
                htmlFor="file-upload"
                className={`upload-area ${isDragging ? 'drag-over' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                aria-label="Área para upload de arquivos XML"
                tabIndex={0}
            >
                <div className="upload-icon">📤</div>
                <p><strong>Clique para selecionar ou arraste os arquivos XML aqui</strong></p>
                <p>Apenas arquivos .xml são aceitos</p>
                <input id="file-upload" type="file" multiple accept=".xml,text/xml" onChange={handleFileChange} style={{ display: 'none' }} />
            </label>

            {files.length > 0 && (
                <div className="file-list" aria-live="polite">
                    <p><strong>Arquivos selecionados:</strong></p>
                    {files.map((file: File, idx: number) => <div key={file.name + idx} className="file-item">{file.name}</div>)}
                </div>
            )}
            
            <details className="ncm-filter-section">
                <summary>Filtro de NCM (Opcional)</summary>
                <div className="filter-content">
                    <div>
                        <label htmlFor="ncm-allow-upload">Importar NCMs Permitidos (prefixos, .txt)</label>
                        <p className="description">O arquivo deve conter NCMs separados por vírgula ou quebra de linha.</p>
                        <input id="ncm-allow-upload" type="file" accept=".txt" onChange={handleAllowedNcmFile} style={{ display: 'none' }} />
                        <label htmlFor="ncm-allow-upload" className="btn btn-tertiary" tabIndex={0}>Selecionar Arquivo</label>
                        <textarea
                            id="ncm-allow-textarea"
                            value={allowedNcms.join(', ')}
                            onChange={handleAllowedNcmsChange}
                            rows={5}
                            placeholder="Digite os NCMs permitidos separados por vírgula"
                            aria-label="NCMs permitidos, separados por vírgula"
                            style={{ marginTop: '1rem', width: '100%', resize: 'vertical' }}
                        />
                    </div>
                </div>
            </details>

            <div className="controls">
                <button className="btn btn-primary" onClick={processFiles} disabled={files.length === 0 || isLoading}>
                    {isLoading ? 'Processando...' : 'Processar Arquivos'}
                </button>
                <button className="btn btn-secondary" onClick={clearState} disabled={isLoading}>
                    Limpar
                </button>
            </div>

            <div className="status" aria-live="assertive">
                {isLoading && <div className="loader" aria-label="Carregando"></div>}
                <p>{progress}</p>
            </div>
            
            {errors.length > 0 && (
                <div className="error-list" role="alert">
                    <p><strong>Alguns arquivos não puderam ser processados:</strong></p>
                    <ul>
                        {errors.map(err => <li key={err.file} className="error-item">{err.file}: {err.message}</li>)}
                    </ul>
                </div>
            )}

            {data.length > 0 && (
                <section aria-labelledby="results-title">
                    <div className="results-header">
                        <h2 id="results-title">Resultados ({data.length} itens)</h2>
                        <div className="results-actions">
                           <button className="btn btn-success" onClick={() => generateAndDownloadXLSX(data, 'itens_nfe_completo.xlsx')}>Baixar XLSX Completo</button>
                           <button className="btn btn-primary" onClick={downloadFilteredXLSX}>Baixar XLSX Filtrado (NCM)</button>
                        </div>
                    </div>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    {Object.keys(data[0]).map(key => <th key={key}>{key}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {data.map((item, index) => (
                                    <tr key={`${item.Chave}-${index}`}>
                                        {Object.values(item).map((value, i) => <td key={i}>{value}</td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}
        </div>
    );
};

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<App />);
}