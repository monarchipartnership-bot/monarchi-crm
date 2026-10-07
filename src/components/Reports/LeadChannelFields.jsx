import Select from '../common/Select';
import { useLeadChannels } from '../../lib/leadChannels';
import { UPWORK_CHANNEL_OPTIONS } from '../../lib/upworkChannels';

// The two per-lead channel pickers shared by every place a report row is
// edited: the general source channel (any channel, new ones can be added on
// the spot) and, for Upwork leads, the specific Upwork channel — which is what
// the weekly/monthly per-channel lead counts are built from.
export function LeadChannelSelect({ value, onChange, bare }) {
  const { options, addChannel } = useLeadChannels();
  return (
    <Select bare={bare} searchable onCreate={addChannel} value={value || ''} onChange={onChange} options={options} placeholder="Не вказано" />
  );
}

export function UpworkChannelSelect({ value, onChange, bare }) {
  return (
    <Select bare={bare} value={value || ''} onChange={onChange} options={UPWORK_CHANNEL_OPTIONS} placeholder="Оберіть канал Upwork" />
  );
}
