from starkware.starknet.core.os.contract_address.contract_address import (
    calculate_contract_address_from_hash,
)

import sys
import ast

def get_contract_address(args):
    assert len(args) == 4, "Not enough arguments to calcuate address"
    [salt, class_hash, constructor_calldata, deployer_address] = args

    salt = int(salt, 16)
    class_hash = int(class_hash, 16)
    constructor_calldata = ast.literal_eval(constructor_calldata)
    deployer_address = int(deployer_address, 16)

    # print(salt, class_hash, constructor_calldata, deployer_address)

    return calculate_contract_address_from_hash(salt, class_hash, constructor_calldata, deployer_address)

if __name__ == '__main__':
    print(get_contract_address(sys.argv[1:]))

