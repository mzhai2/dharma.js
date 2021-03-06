import * as Web3 from "web3";
import * as singleLineString from "single-line-string";
import { BigNumber } from "bignumber.js";

import { Web3Utils } from "../../utils/web3_utils";

import { ContractsAPI } from "./";
import { Assertions } from "../invariants";
import { TxData } from "../types";

const TRANSFER_GAS_MAXIMUM = 70000;

export const TokenAPIErrors = {
    INSUFFICIENT_SENDER_BALANCE: address =>
        singleLineString`SENDER with address ${address} does not have sufficient balance in the specified token
                         to execute this transfer.`,
    INSUFFICIENT_SENDER_ALLOWANCE: address =>
        singleLineString`SENDER with address ${address} does not have sufficient allowance in the specified token
                         to execute this transfer.`,
};

export class TokenAPI {
    private web3: Web3;
    private contracts: ContractsAPI;
    private assert: Assertions;

    constructor(web3: Web3, contracts: ContractsAPI) {
        this.web3 = web3;
        this.contracts = contracts;
        this.assert = new Assertions(this.web3);
    }

    /**
     * Asynchronously transfer value denominated in the specified ERC20 token to
     * the address specified.
     *
     * @param  tokenAddress the address of the token being used.
     * @param  to           to whom the transfer is being made.
     * @param  value        the amount being transferred.
     * @param  options      any parameters necessary to modify the transaction.
     * @return              the hash of the resulting transaction.
     */
    public async transferAsync(
        tokenAddress: string,
        to: string,
        value: BigNumber,
        options?: TxData,
    ): Promise<string> {
        const transactionOptions = await this.getTxDefaultOptions();

        Object.assign(transactionOptions, options);

        const tokenContract = await this.contracts.loadERC20TokenAsync(tokenAddress);

        await this.assert.token.hasSufficientBalance(
            tokenContract,
            options.from,
            value,
            TokenAPIErrors.INSUFFICIENT_SENDER_BALANCE(options.from),
        );

        return tokenContract.transfer.sendTransactionAsync(to, value, transactionOptions);
    }

    /**
     * Asynchronously transfer the value amount in the token specified so long
     * as the sender of the message has received sufficient allowance on behalf
     * of `from` to do so.
     *
     * @param  tokenAddress the address of the token being used.
     * @param  from         from whom are the funds being transferred.
     * @param  to           to whom are the funds being transferred.
     * @param  value        the amount to be transferred.
     * @param  options      any parameters necessary to modify the transaction.
     * @return              the hash of the resulting transaction.
     */
    public async transferFromAsync(
        tokenAddress: string,
        from: string,
        to: string,
        value: BigNumber,
        options?: TxData,
    ): Promise<string> {
        const transactionOptions = await this.getTxDefaultOptions();

        Object.assign(transactionOptions, options);

        const tokenContract = await this.contracts.loadERC20TokenAsync(tokenAddress);

        await this.assert.token.hasSufficientBalance(
            tokenContract,
            from,
            value,
            TokenAPIErrors.INSUFFICIENT_SENDER_BALANCE(from),
        );

        await this.assert.token.hasSufficientAllowance(
            tokenContract,
            from,
            options.from,
            value,
            TokenAPIErrors.INSUFFICIENT_SENDER_ALLOWANCE(from),
        );

        return tokenContract.transferFrom.sendTransactionAsync(from, to, value, transactionOptions);
    }

    /**
     * Asynchronously retrieve the balance of tokens for the owner specified.
     *
     * @param  tokenAddress address of the ERC20 token.
     * @param  ownerAddress address of the owner for whom the balance is being requested.
     * @return              the number of tokens the owner is holding.
     */
    public async getBalanceAsync(tokenAddress: string, ownerAddress: string): Promise<BigNumber> {
        const tokenContract = await this.contracts.loadERC20TokenAsync(tokenAddress);

        await this.assert.token.implementsERC20(tokenContract);

        return tokenContract.balanceOf.callAsync(ownerAddress);
    }

    /**
     * Asynchronously set an allowance to the `tokenTransferProxy`.
     *
     * @param  tokenAddress address of the ERC20 token.
     * @param  allowance    the size of the allowance.
     * @param  options      any parameters necessary to modify the transaction.
     * @return              the hash of the resulting transaction.
     */
    public async setProxyAllowanceAsync(
        tokenAddress: string,
        allowance: BigNumber,
        options?: TxData,
    ): Promise<string> {
        const transactionOptions = await this.getTxDefaultOptions();

        Object.assign(transactionOptions, options);

        const tokenContract = await this.contracts.loadERC20TokenAsync(tokenAddress);

        await this.assert.token.implementsERC20(tokenContract);

        const tokenTransferProxy = await this.contracts.loadTokenTransferProxyAsync();

        return tokenContract.approve.sendTransactionAsync(
            tokenTransferProxy.address,
            allowance,
            transactionOptions,
        );
    }

    /**
     * Asynchronously set an unlimited proxy allowance to the `tokenTransferProxy`.
     *
     * @param  tokenAddress address of the ERC20 token.
     * @param  options      any parameters necessary to modify the transaction.
     * @return              the hash of the resulting transaction.
     */
    public async setUnlimitedProxyAllowanceAsync(
        tokenAddress: string,
        options?: TxData,
    ): Promise<string> {
        const tokenContract = await this.contracts.loadERC20TokenAsync(tokenAddress);

        await this.assert.token.implementsERC20(tokenContract);

        // We set an allowance to be "unlimited" by setting it to
        // it's maximum possible value -- namely, 2^256 - 1.
        const unlimitedAllowance = new BigNumber(2).pow(256).sub(1);

        return this.setProxyAllowanceAsync(tokenAddress, unlimitedAllowance, options);
    }

    /**
     * Asynchronously determine the allowance afforded to the
     * `tokenTransferProxy` allotted by the specified owner.
     *
     * @param  tokenAddress address of the ERC20 token.
     * @param  ownerAddress the owner who made the allowance allotment.
     * @return              the allowance allotted to the `tokenTransferProxy`.
     */
    public async getProxyAllowanceAsync(
        tokenAddress: string,
        ownerAddress: string,
    ): Promise<BigNumber> {
        const tokenContract = await this.contracts.loadERC20TokenAsync(tokenAddress);

        await this.assert.token.implementsERC20(tokenContract);

        const tokenTransferProxy = await this.contracts.loadTokenTransferProxyAsync();

        return tokenContract.allowance.callAsync(ownerAddress, tokenTransferProxy.address);
    }

    private async getTxDefaultOptions(): Promise<object> {
        const web3Utils = new Web3Utils(this.web3);

        const accounts = await web3Utils.getAvailableAddressesAsync();

        // TODO: Add fault tolerance to scenario in which not addresses are available

        return {
            from: accounts[0],
            gas: TRANSFER_GAS_MAXIMUM,
        };
    }
}
