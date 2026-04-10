import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { parseCsv, readFileAsText } from '@/lib/csvImport';
import { useToast } from '@/hooks/use-toast';

interface CsvImportButtonProps {
  onImport: (rows: Record<string, string>[]) => Promise<{ success: number; errors: string[] }>;
  expectedColumns: string[];
  label?: string;
}

export function CsvImportButton({ onImport, expectedColumns, label = 'Import CSV' }: CsvImportButtonProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Record<string, string>[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const { toast } = useToast();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const rows = parseCsv(text);
      if (!rows.length) { toast({ title: 'Empty CSV', variant: 'destructive' }); return; }
      setPreview(rows);
      setDialogOpen(true);
    } catch {
      toast({ title: 'Failed to read file', variant: 'destructive' });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setImporting(true);
    try {
      const result = await onImport(preview);
      toast({ title: `Imported ${result.success} rows` });
      if (result.errors.length) {
        toast({ title: `${result.errors.length} errors`, description: result.errors.slice(0, 3).join('; '), variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Import failed', description: err.message, variant: 'destructive' });
    } finally {
      setImporting(false);
      setDialogOpen(false);
      setPreview(null);
    }
  };

  const headers = preview ? Object.keys(preview[0]) : [];

  return (
    <>
      <input ref={fileRef} type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
      <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
        <Upload className="mr-1 h-4 w-4" />{label}
      </Button>
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setPreview(null); }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview Import ({preview?.length} rows)</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-2">
            Expected columns: {expectedColumns.join(', ')}
          </p>
          <div className="overflow-x-auto rounded border max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {headers.map(h => <TableHead key={h}>{h}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview?.slice(0, 20).map((row, i) => (
                  <TableRow key={i}>
                    {headers.map(h => <TableCell key={h} className="text-sm">{row[h]}</TableCell>)}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {(preview?.length ?? 0) > 20 && <p className="text-sm text-muted-foreground">Showing first 20 of {preview?.length} rows</p>}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleConfirm} disabled={importing}>
              {importing ? 'Importing...' : `Import ${preview?.length} rows`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
