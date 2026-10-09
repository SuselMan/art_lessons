import{assertWholeEqual}from'./MixedLeaseUiAssertions.mjs';
export function recordWholeBeforeCompare(expectedWhole,whole,persist){
 persist({whole,expectedWhole});
 assertWholeEqual(expectedWhole,whole,'Resume durable dry');
}
