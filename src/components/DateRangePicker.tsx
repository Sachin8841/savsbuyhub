import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const PERIOD_OPTIONS = [
  { label: '1D', value: 'day' },
  { label: '7D', value: 'week' },
  { label: '30D', value: 'month' },
  { label: '1Y', value: 'year' },
  { label: 'Max', value: 'max' },
  { label: 'Custom', value: 'custom' },
];

interface PeriodSelectorProps {
  value: string;
  onChange: (v: string) => void;
  dateRange?: { from?: Date; to?: Date };
  onDateRangeChange?: (range: { from?: Date; to?: Date }) => void;
}

export function PeriodSelector({ value, onChange, dateRange, onDateRangeChange }: PeriodSelectorProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg p-0.5 w-fit">
        {PERIOD_OPTIONS.map(p => (
          <Button
            key={p.value}
            variant={value === p.value ? 'default' : 'ghost'}
            size="sm"
            className="text-xs h-6 px-2.5"
            onClick={() => {
              onChange(p.value);
              if (p.value === 'custom') setOpen(true);
            }}
          >
            {p.label}
          </Button>
        ))}
      </div>
      {value === 'custom' && onDateRangeChange && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 text-xs gap-1">
              <CalendarIcon className="h-3 w-3" />
              {dateRange?.from ? (
                dateRange.to ? `${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d')}` : format(dateRange.from, 'MMM d, yyyy')
              ) : 'Pick dates'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="range"
              selected={dateRange as any}
              onSelect={(range: any) => {
                onDateRangeChange(range || {});
                if (range?.from && range?.to) setOpen(false);
              }}
              numberOfMonths={2}
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

export function getFilterDate(period: string, dateRange?: { from?: Date; to?: Date }): { from: Date | null; to: Date | null } {
  if (period === 'custom' && dateRange?.from) {
    return { from: dateRange.from, to: dateRange.to || new Date() };
  }
  const d = new Date();
  if (period === 'day') d.setDate(d.getDate() - 1);
  else if (period === 'week') d.setDate(d.getDate() - 7);
  else if (period === 'month') d.setMonth(d.getMonth() - 1);
  else if (period === 'year') d.setFullYear(d.getFullYear() - 1);
  else return { from: null, to: null };
  return { from: d, to: new Date() };
}
