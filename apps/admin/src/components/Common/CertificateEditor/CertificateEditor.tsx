import React, { useState, useRef, useEffect } from 'react';
import { Upload, Download, Save, X, Move, Plus, Trash2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

interface Field {
  id: string;
  label: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontFamily: string;
  alignment: 'left' | 'center' | 'right';
  required: boolean;
}

interface ImageSize {
  width: number;
  height: number;
}

interface PreviewData {
  name: string;
  date: string;
  certificateId: string;
}

interface CertificateEditorProps {
  initialConfig?: any;
  onSave?: (config: any) => Promise<{ success: boolean; error?: string }>;
}

const DEFAULT_FIELDS: Field[] = [
  { id: 'name', label: 'Name', x: 50, y: 45, fontSize: 48, color: '#000000', fontFamily: 'serif', alignment: 'center', required: true }
]

const CertificateEditor: React.FC<CertificateEditorProps> = ({ initialConfig, onSave }) => {
  const [templateImage, setTemplateImage] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<ImageSize>({ width: 0, height: 0 });
  const [certificateName, setCertificateName] = useState<string>('');
  const [fields, setFields] = useState<Field[]>(DEFAULT_FIELDS);
  const [dragging, setDragging] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string>('');
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [previewData, setPreviewData] = useState<PreviewData>({
    name: 'John Doe',
    date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    certificateId: 'PS-CERT-DEMO-001'
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!initialConfig) return;

    setImageSize(initialConfig.imageSize);
    setTemplateImage(initialConfig.templateImage);
    setCertificateName(initialConfig.certificateName || "");
  }, [initialConfig]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const processImageFile = (file: File) => {
    setIsProcessing(true);
    setUploadError('');

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setUploadError('Please upload an image file (PNG, JPG, etc.)');
      setIsProcessing(false);
      return;
    }

    // Check file size - 1MB limit
    const maxSize = 1 * 1024 * 1024; // 1MB
    if (file.size > maxSize) {
      setUploadError(`Image size is ${formatFileSize(file.size)}. Maximum allowed size is 1MB. Please use a smaller image.`);
      setIsProcessing(false);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        setImageSize({ width: img.width, height: img.height });
        setTemplateImage(event.target?.result as string);
        setIsProcessing(false);
      };

      img.onerror = () => {
        setUploadError('Failed to load image. Please try a different file.');
        setIsProcessing(false);
      };

      img.src = event.target?.result as string;
    };

    reader.onerror = () => {
      setUploadError('Failed to read file. Please try again.');
      setIsProcessing(false);
    };

    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const handleMouseDown = (fieldId: string, e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(fieldId);
    setSelectedField(fieldId);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setFields(prevFields => prevFields.map(field =>
      field.id === dragging
        ? { ...field, x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) }
        : field
    ));
  };

  const handleMouseUp = () => {
    setDragging(null);
  };

  const updateField = (fieldId: string, property: keyof Field, value: any) => {
    setFields(prevFields => prevFields.map(field =>
      field.id === fieldId ? { ...field, [property]: value } : field
    ));
  };

  const addField = (type: string) => {
    const newField: Field = {
      id: type,
      label: type.charAt(0).toUpperCase() + type.slice(1),
      x: 50,
      y: 60 + (fields.length * 10),
      fontSize: type === 'date' ? 24 : 20,
      color: type === 'certificateId' ? '#666666' : '#000000',
      fontFamily: type === 'certificateId' ? 'monospace' : 'serif',
      alignment: 'center',
      required: false
    };
    setFields([...fields, newField]);
    setSelectedField(newField.id);
  };

  const removeField = (fieldId: string) => {
    if (fieldId === 'name') {
      alert('Name field is required and cannot be removed');
      return;
    }
    setFields(prevFields => prevFields.filter(f => f.id !== fieldId));
    if (selectedField === fieldId) {
      setSelectedField(null);
    }
  };

  const saveTemplate = async () => {
    if (!templateImage) {
      setSaveMessage('Please upload a template image');
      return;
    }
    if (!certificateName) {
      setSaveMessage('Please enter a Certificate Name');
      return;
    }

    setSaving(true);
    setSaveMessage('');

    try {
      const config = {
        certificateName,
        imageSize,
        fields: fields.map(({ id, label, x, y, fontSize, color, fontFamily, alignment, required }) => ({
          id, label, x, y, fontSize, color, fontFamily, alignment, required
        })),
        templateImage
      };

      if (onSave) {
        const result = await onSave(config);
        if (result.success) {
          setSaveMessage('success');
          setTimeout(() => setSaveMessage(''), 3000);
        } else {
          setSaveMessage(`error: ${result.error || 'Failed to save template'}`);
        }
      } else {
        setSaveMessage('error: Save function not provided');
      }
    } catch (error) {
      console.error('Error saving template:', error);
      setSaveMessage('error: Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const generatePreview = () => {
    if (!templateImage || !previewCanvasRef.current) return;

    const canvas = previewCanvasRef.current;
    canvas.width = imageSize.width;
    canvas.height = imageSize.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);

      const fieldValues: Record<string, string> = {
        name: previewData.name,
        date: previewData.date,
        certificateId: previewData.certificateId
      };

      fields.forEach(field => {
        const value = fieldValues[field.id] || '';
        if (!value) return;

        const x = (field.x / 100) * imageSize.width;
        const y = (field.y / 100) * imageSize.height;

        ctx.font = `bold ${field.fontSize}px ${field.fontFamily}`;
        ctx.fillStyle = field.color;
        ctx.textAlign = field.alignment;
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        ctx.shadowBlur = 4;

        ctx.fillText(value, x, y);

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      });
    };
    img.src = templateImage;
  };

  const downloadPreview = () => {
    if (!previewCanvasRef.current) return;

    const canvas = previewCanvasRef.current;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `preview-certificate-${previewData.certificateId}.png`;
    a.click();
  };

  useEffect(() => {
    if (showPreview && templateImage) {
      setTimeout(() => generatePreview(), 100);
    }
  }, [showPreview, previewData, fields, templateImage, imageSize]);

  const selectedFieldData = fields.find(f => f.id === selectedField);
  const hasDateField = fields.some(f => f.id === 'date');
  const hasCertIdField = fields.some(f => f.id === 'certificateId');

  // Helper function to get alignment label for preview
  const getAlignmentTransform = (alignment: string) => {
    switch (alignment) {
      case 'left': return '-translate-x-0';
      case 'right': return '-translate-x-full';
      default: return '-translate-x-1/2';
    }
  };

  const handleImageLoad = () => {
    setFields(initialConfig?.fields.length > 0 ? initialConfig.fields : DEFAULT_FIELDS);
  }

  return (
    <div>
      <Card className="rounded-2xl border shadow-[none]">
        <CardHeader className="space-y-1">
          <CardTitle className="text-3xl">Certificate Template Editor</CardTitle>
          <CardDescription>
            Create and save certificate templates for your events
          </CardDescription>
        </CardHeader>

        <CardContent>
          {!templateImage ? (
            <div className="space-y-6">
              {uploadError && (
                <Alert variant="destructive">
                  <AlertDescription>{uploadError}</AlertDescription>
                </Alert>
              )}

              <div
                className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${isProcessing
                    ? 'border-primary bg-primary/5 cursor-wait'
                    : 'hover:border-primary/50 cursor-pointer'
                  }`}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => !isProcessing && fileInputRef.current?.click()}
              >
                {isProcessing ? (
                  <>
                    <div className="mx-auto h-12 w-12 mb-4 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    <p className="text-lg font-medium mb-2">Loading image...</p>
                    <p className="text-sm text-muted-foreground">Please wait</p>
                  </>
                ) : (
                  <>
                    <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-lg font-medium mb-2">Drop your certificate template here</p>
                    <p className="text-sm text-muted-foreground">or click to browse</p>
                    <p className="text-xs text-muted-foreground mt-4">
                      PNG, JPG or any image format
                    </p>
                    <p className="text-xs font-medium text-destructive mt-2">
                      Maximum file size: 1MB
                    </p>
                  </>
                )}
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={isProcessing}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="space-y-2">
                      <Label htmlFor="certificateName-edit">
                        Certificate Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="certificateName-edit"
                        value={certificateName}
                        onChange={(e) => setCertificateName(e.target.value)}
                        placeholder="e.g., Participation Certificate"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-muted/30">
                  <CardContent className="p-4">
                    <div
                      ref={containerRef}
                      className="relative inline-block max-w-full"
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                    >
                      <img
                        src={templateImage}
                        alt="Certificate Template"
                        className="max-w-full h-auto rounded shadow-lg"
                        draggable={false}
                        onLoad={handleImageLoad}
                      />
                      {fields.map((field) => (
                        <div
                          key={field.id}
                          className={`absolute cursor-move transform ${getAlignmentTransform(field.alignment)} -translate-y-1/2 ${selectedField === field.id
                            ? 'ring-4 ring-primary'
                            : 'ring-2 ring-muted-foreground'
                            } rounded px-2 py-1`}
                          style={{
                            left: `${field.x}%`,
                            top: `${field.y}%`,
                            fontSize: `${field.fontSize * (containerRef.current?.offsetWidth ? containerRef.current.offsetWidth / imageSize.width : 1)}px`,
                            color: field.color,
                            fontFamily: field.fontFamily,
                            fontWeight: 'bold',
                            textShadow: '0 0 4px rgba(255,255,255,0.8)',
                          }}
                          onMouseDown={(e) => handleMouseDown(field.id, e)}
                        >
                          <Move className="inline mr-1 h-3 w-3" />
                          {field.label} {field.required && <span className="text-destructive">*</span>}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center justify-between">
                      Field Settings
                      {selectedFieldData && (
                        <Badge variant="secondary">{selectedFieldData.label}</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {selectedFieldData ? (
                      <>
                        <div className="space-y-2">
                          <Label>Font Size: {selectedFieldData.fontSize}px</Label>
                          <Slider
                            value={[selectedFieldData.fontSize]}
                            onValueChange={(value) => updateField(selectedField!, 'fontSize', value[0])}
                            min={12}
                            max={96}
                            step={1}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="color">Color</Label>
                          <Input
                            id="color"
                            type="color"
                            value={selectedFieldData.color}
                            onChange={(e) => updateField(selectedField!, 'color', e.target.value)}
                            className="h-10"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="fontFamily">Font Family</Label>
                          <Select
                            value={selectedFieldData.fontFamily}
                            onValueChange={(value) => updateField(selectedField!, 'fontFamily', value)}
                          >
                            <SelectTrigger id="fontFamily">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="serif">Serif</SelectItem>
                              <SelectItem value="sans-serif">Sans Serif</SelectItem>
                              <SelectItem value="monospace">Monospace</SelectItem>
                              <SelectItem value="cursive">Cursive</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="alignment">Text Alignment</Label>
                          <Select
                            value={selectedFieldData.alignment}
                            onValueChange={(value) => updateField(selectedField!, 'alignment', value as 'left' | 'center' | 'right')}
                          >
                            <SelectTrigger id="alignment">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="left">Left</SelectItem>
                              <SelectItem value="center">Center</SelectItem>
                              <SelectItem value="right">Right</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {!selectedFieldData.required && (
                          <Button
                            onClick={() => removeField(selectedField!)}
                            variant="destructive"
                            className="w-full"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove Field
                          </Button>
                        )}

                        <div className="pt-4 border-t text-xs text-muted-foreground">
                          Position: X: {selectedFieldData.x.toFixed(1)}%, Y: {selectedFieldData.y.toFixed(1)}%
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">Click on a field to edit its properties</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Fields</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {fields.map(field => (
                      <Button
                        key={field.id}
                        onClick={() => setSelectedField(field.id)}
                        variant={selectedField === field.id ? "default" : "outline"}
                        className="w-full justify-start"
                      >
                        {field.label} {field.required && <span className="text-destructive ml-1">*</span>}
                      </Button>
                    ))}

                    <div className="pt-2 space-y-2 border-t">
                      <p className="text-xs font-medium text-muted-foreground">Add Optional Field:</p>
                      {!hasDateField && (
                        <Button
                          onClick={() => addField('date')}
                          variant="secondary"
                          size="sm"
                          className="w-full"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Date Field
                        </Button>
                      )}
                      {!hasCertIdField && (
                        <Button
                          onClick={() => addField('certificateId')}
                          variant="secondary"
                          size="sm"
                          className="w-full"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Certificate ID
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {saveMessage && (
                  <Alert variant={saveMessage === 'success' ? 'default' : 'destructive'}>
                    <AlertDescription>
                      {saveMessage === 'success'
                        ? '✓ Template saved successfully!'
                        : saveMessage.replace('error: ', '')}
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Button
                    onClick={saveTemplate}
                    disabled={saving}
                    className="w-full"
                    size="lg"
                  >
                    <Save className="h-5 w-5 mr-2" />
                    {saving ? 'Saving...' : 'Save Template'}
                  </Button>

                  <Button
                    onClick={() => setShowPreview(true)}
                    variant="secondary"
                    className="w-full"
                    size="lg"
                  >
                    <Eye className="h-5 w-5 mr-2" />
                    Preview Certificate
                  </Button>

                  <Button
                    onClick={() => {
                      setTemplateImage(null);
                      setSelectedField(null);
                      setUploadError('');
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    variant="outline"
                    className="w-full"
                  >
                    <X className="h-5 w-5 mr-2" />
                    Clear Template
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Certificate Preview</DialogTitle>
            <DialogDescription>
              Test your certificate design with sample data
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="preview-name">
                  Name {fields.find(f => f.id === 'name')?.required && <span className="text-destructive">*</span>}
                </Label>
                <Input
                  id="preview-name"
                  value={previewData.name}
                  onChange={(e) => setPreviewData({ ...previewData, name: e.target.value })}
                  placeholder="Enter name"
                />
              </div>

              {fields.some(f => f.id === 'date') && (
                <div className="space-y-2">
                  <Label htmlFor="preview-date">Date</Label>
                  <Input
                    id="preview-date"
                    value={previewData.date}
                    onChange={(e) => setPreviewData({ ...previewData, date: e.target.value })}
                    placeholder="Enter date"
                  />
                </div>
              )}

              {fields.some(f => f.id === 'certificateId') && (
                <div className="space-y-2">
                  <Label htmlFor="preview-certId">Certificate ID</Label>
                  <Input
                    id="preview-certId"
                    value={previewData.certificateId}
                    onChange={(e) => setPreviewData({ ...previewData, certificateId: e.target.value })}
                    placeholder="Enter certificate ID"
                  />
                </div>
              )}
            </div>

            <div className="bg-muted/30 rounded-lg p-4 flex justify-center">
              <canvas
                ref={previewCanvasRef}
                className="max-w-full h-auto rounded shadow-lg"
              />
            </div>

            <div className="flex gap-4">
              <Button onClick={downloadPreview} className="flex-1" size="lg">
                <Download className="h-5 w-5 mr-2" />
                Download Preview
              </Button>
              <Button onClick={() => setShowPreview(false)} variant="outline" className="flex-1" size="lg">
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CertificateEditor;