import copy
import unittest
from review_native_scope import native_scope, classify_catalog, KEEP_KEYS


class ScopeTest(unittest.TestCase):
    def fixture(self):
        choices = [dict(key=k,kind='native-mini',model='front8-detail-flow-v4') for k in KEEP_KEYS[:-1]]
        choices += [dict(key='input',kind='input-reference'),dict(key='exact-native-looking',kind='worker-factory',algorithm='wgsl-macro-current-exact-program')]
        variants = [dict(id='original' if k=='original' else k,comparisonKey=k,image=k+'.png',evidence=dict(fixedMatrix=True)) for k in KEEP_KEYS]
        variants += [dict(id='external',comparisonKey='exact-native-looking',image='external.png')]
        return dict(choices=choices),dict(fixedMatrixCoverage=dict(complete=True),scenes=[dict(id='s',variants=variants)])

    def test_exact_new_solver_is_not_a_native_port(self):
        plan,data=self.fixture();before=copy.deepcopy(data);out=native_scope(data,plan)
        self.assertEqual(data,before)
        self.assertEqual([v['comparisonKey']for v in out['scenes'][0]['variants']],list(KEEP_KEYS))
        self.assertEqual(len(out['variantCatalog']),5)
        self.assertEqual(out['scenes'][0]['variants'][0]['image'],'original.png')
        self.assertFalse(classify_catalog(plan)[-1]['keep'])
        self.assertEqual(out['fixedMatrixCoverage']['cells'],5)

    def test_no_missing_or_duplicate_native_is_fabricated(self):
        plan,data=self.fixture();data['scenes'][0]['variants'].pop(1)
        with self.assertRaises(ValueError):native_scope(data,plan)
        plan,data=self.fixture();data['scenes'][0]['variants'].append(copy.deepcopy(data['scenes'][0]['variants'][0]))
        with self.assertRaises(ValueError):native_scope(data,plan)
        plan,data=self.fixture();data['fixedMatrixCoverage']['complete']=False
        with self.assertRaises(ValueError):native_scope(data,plan)


if __name__=='__main__':unittest.main()
