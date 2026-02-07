import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export function ResultsChart({ candidates, totalVotes, realVoterCount }) {
    if (!candidates || candidates.length === 0) return <div>No data</div>;

    const data = candidates.map(c => ({
        name: c.name,
        votes: c.votes,
        fill: c.color_code,
        threshold: realVoterCount
    }));

    return (
        <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} layout="vertical" margin={{ top: 20, right: 30, left: 40, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                    <XAxis type="number" stroke="#94a3b8" />
                    <YAxis dataKey="name" type="category" stroke="#e2e8f0" width={100} />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                        cursor={{ fill: '#334155', opacity: 0.2 }}
                    />
                    {/* Threshold Line (Real Voter Count) */}
                    <Line
                        type="monotone"
                        dataKey="threshold"
                        stroke="#ff0000"
                        strokeWidth={2}
                        dot={false}
                        name="Max Verified Votes"
                    />
                    {/* Vote Bars */}
                    <Bar dataKey="votes" barSize={20} radius={[0, 4, 4, 0]}>
                        {data.map((entry, index) => (
                            <cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                    </Bar>
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}
