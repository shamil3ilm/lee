'use client'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BatchPanel } from './batch-panel'
import { ComparePanel } from './compare-panel'
import { ScorePanel } from './score-panel'
import type { AppOption, CvDocOption } from './source-picker'

interface CvScoreWorkbenchProps {
  documents: CvDocOption[]
  applications: AppOption[]
  initialDocumentId: string
  initialApplicationId: string
  initialTab: 'score' | 'compare' | 'batch'
}

export function CvScoreWorkbench(props: CvScoreWorkbenchProps) {
  return (
    <Tabs defaultValue={props.initialTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="score">Score</TabsTrigger>
        <TabsTrigger value="compare">Compare</TabsTrigger>
        <TabsTrigger value="batch">Batch</TabsTrigger>
      </TabsList>
      <TabsContent value="score">
        <ScorePanel
          documents={props.documents}
          applications={props.applications}
          initialDocumentId={props.initialDocumentId}
          initialApplicationId={props.initialApplicationId}
        />
      </TabsContent>
      <TabsContent value="compare">
        <ComparePanel documents={props.documents} applications={props.applications} />
      </TabsContent>
      <TabsContent value="batch">
        <BatchPanel />
      </TabsContent>
    </Tabs>
  )
}
