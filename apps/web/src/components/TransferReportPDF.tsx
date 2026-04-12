// apps/web/src/components/TransferReportPDF.tsx
// PharmIQ Dead-Stock Transfer Report — @react-pdf/renderer document component
// Uses system fonts (Helvetica) for reliable Cloudflare Pages deployment.
// Font.register with gstatic.com URLs is NOT used (see RESEARCH.md Pitfall 2).

import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { MatchResult } from '../hooks/useMatchRun';

// --- Column definitions ---
const COLUMNS = [
  { header: 'SKU',              flex: 1.2 },
  { header: 'Description',      flex: 2 },
  { header: 'Source Store',     flex: 1.2 },
  { header: 'Destination',      flex: 1.2 },
  { header: 'Qty',              flex: 0.7 },
  { header: 'Dest ROU',         flex: 0.7 },
  { header: 'Months Cover',     flex: 0.9 },
  { header: 'Sell-Through',     flex: 0.9 },
] as const;

// --- Styles ---
const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 9,
    fontFamily: 'Helvetica',
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingBottom: 10,
    borderBottom: '1px solid #E2E8F0',
  },
  titleBlock: {
    flexDirection: 'column',
  },
  title: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#0F766E',
    marginBottom: 3,
  },
  subtitle: {
    fontSize: 8,
    color: '#475569',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottom: '1.5px solid #CBD5E1',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderBottom: '1px solid #E2E8F0',
  },
  tableRowAlt: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderBottom: '1px solid #E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  colHeader: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#475569',
  },
  col: {
    fontSize: 8,
    color: '#0F172A',
  },
  colMuted: {
    fontSize: 8,
    color: '#475569',
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 32,
    right: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 7,
    color: '#94A3B8',
  },
});

// --- Props ---
interface TransferReportPDFProps {
  results: MatchResult[];
  orgName: string;
}

// --- Component ---
export function TransferReportPDF({ results, orgName }: TransferReportPDFProps) {
  const generatedDate = new Date().toISOString().split('T')[0];

  return (
    <Document title="PharmIQ — Dead-Stock Transfer Report" author="PharmIQ">
      <Page size="A4" orientation="landscape" style={styles.page}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>PharmIQ — Dead-Stock Transfer Report</Text>
            <Text style={styles.subtitle}>{orgName} · Generated {generatedDate}</Text>
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.subtitle}>{results.length} transfer{results.length !== 1 ? 's' : ''} identified</Text>
          </View>
        </View>

        {/* Table header row */}
        <View style={styles.tableHeaderRow}>
          {COLUMNS.map(col => (
            <Text key={col.header} style={[styles.colHeader, { flex: col.flex }]}>
              {col.header}
            </Text>
          ))}
        </View>

        {/* Data rows — best-match only (one row per SKU per D-06) */}
        {results.map((r, index) => (
          <View
            key={`${r.sku}-${r.sourceStore}`}
            style={index % 2 === 0 ? styles.tableRow : styles.tableRowAlt}
          >
            <Text style={[styles.col, { flex: COLUMNS[0].flex }]}>{r.sku}</Text>
            <Text style={[styles.colMuted, { flex: COLUMNS[1].flex }]}>{r.description}</Text>
            <Text style={[styles.colMuted, { flex: COLUMNS[2].flex }]}>{r.sourceStore}</Text>
            <Text style={[styles.colMuted, { flex: COLUMNS[3].flex }]}>{r.bestMatch.store}</Text>
            <Text style={[styles.col,      { flex: COLUMNS[4].flex }]}>{r.bestMatch.qtyToTransfer.toFixed(1)}</Text>
            <Text style={[styles.colMuted, { flex: COLUMNS[5].flex }]}>{r.bestMatch.rou.toFixed(1)}</Text>
            <Text style={[styles.colMuted, { flex: COLUMNS[6].flex }]}>{r.bestMatch.monthsCover}</Text>
            <Text style={[styles.colMuted, { flex: COLUMNS[7].flex }]}>{r.bestMatch.sellThrough.toFixed(1)} mo</Text>
          </View>
        ))}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>PharmIQ Stock Transfer · pharmiq.com.au</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>

      </Page>
    </Document>
  );
}
